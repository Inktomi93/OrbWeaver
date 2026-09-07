// The multiplexed socket, end-to-end in a real browser (SSE-1 §12). Only the network is stubbed:
// EventSource → httpSubscriptionLink → useOrbSocket → the room registry → useRpgBus/useUserBus.
//
// THE LOAD-BEARING TEST HERE IS THE ATTACH GATE, and it exists because the shape it replaces had no such
// test. `useRpgBus`'s header claimed since 2026-07-31 that "a non-game chat holds no socket", and a live
// drive on 2026-08-01 still showed `GET /api/trpc/rpg.stream` firing on a page with no game open. Nothing in
// the suite could have caught that: the gate lived inside a `skipToken` expression whose only observable
// effect was a network connection nobody counted. Under the multiplex the same decision is an `attach`
// MUTATION — a discrete, recordable call — so `attaches()` turns "did this open a room?" into one
// assertion. These three cases (landing / non-game chat / game chat) are that assertion.
//
// The rest pins the multiplex claim itself: N rooms cost ONE connect, and a frame for a room nobody joined
// is dropped (the registry's own rule, and what the real server would never send anyway).

import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeImpersonateStream } from "../../../support/node/route-impersonate-stream.ts";
import type { SubscriptionErrorPayload } from "../../../support/node/route-orb-socket.ts";
import { routeOrbSocket } from "../../../support/node/route-orb-socket.ts";
import { routeTrpc } from "../../../support/node/route-trpc.ts";
import { RpgBusStory, SocketFaultToastStory, TwoRoomStory, UserBusStory } from "./_ct-stories.tsx";
import { STREAM_MUTATION_ROUTES } from "./fixtures.ts";

const GAME_CHAT = castId<ChatId>("chat_ct_game_01");
const PLAIN_CHAT = castId<ChatId>("chat_ct_plain_01");
const DISENGAGED_CHAT = castId<ChatId>("chat_ct_off_01");

/** `chat.getChat` shaped for the pointer gate's THREE states: a live game, a chat with no pointer at all,
 *  and — the case the old re-spelled null-check got wrong — a chat whose game is present but TOGGLED OFF. */
const getChat = (input: unknown): unknown => {
  const chatId = (input as { chatId: ChatId }).chatId;
  const rpg = ((): unknown => {
    if (chatId === GAME_CHAT) {
      return { gameId: "rpg_game_ct", engaged: true };
    }
    if (chatId === DISENGAGED_CHAT) {
      return { gameId: "rpg_game_ct_off", engaged: false };
    }
    return null;
  })();
  return { id: chatId, title: "room", rpg };
};

const RPG_FRAME: StreamFrame = { channel: "rpg", chatId: GAME_CHAT, event: { type: "gameChanged", chatId: GAME_CHAT } };
const USER_FRAME: StreamFrame = { channel: "user", event: { type: "tagsChanged" } };

test("the LANDING state (no chat) attaches NO room but still holds exactly one socket", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={null} />);

  await expect.poll(() => socket.connects()).toBe(1);
  // The gate: nothing attached. Under the old shape this was an un-assertable network fact.
  await expect.poll(() => socket.attachedChannels()).toEqual([]);
});

test("a NON-GAME chat attaches NO rpg room — the gate the old hook only claimed to hold", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={PLAIN_CHAT} />);

  // Wait for the pointer read to actually RESOLVE (routeTrpc records it) — only then is "no rpg room
  // attached" a verdict rather than a race with a query that had not answered yet.
  await expect.poll(() => socket.connects()).toBe(1);
  await expect.poll(() => trpc.count("chat.getChat")).toBeGreaterThan(0);
  await expect.poll(() => socket.attachedChannels()).toEqual([]);
});

test("a DISENGAGED game (pointer present, `engaged:false`) attaches NO rpg room", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={DISENGAGED_CHAT} />);

  // THE regression this file exists for: the shipped gate was a re-spelled `rpg !== null`, so a game the user
  // had TOGGLED OFF (panel hidden, turn assembly clean, nothing rendered) still held a full always-on stream.
  // Every other consumer of this pointer goes through `isRpgEngaged`; this one has to agree with them.
  await expect.poll(() => socket.connects()).toBe(1);
  await expect.poll(() => trpc.count("chat.getChat")).toBeGreaterThan(0);
  await expect.poll(() => socket.attachedChannels()).toEqual([]);
});

test("a GAME chat attaches exactly ONE rpg room, and its frames drive the invalidation seam", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [RPG_FRAME], awaitAttaches: 1 });

  await mount(<RpgBusStory chatId={GAME_CHAT} />);

  await expect.poll(() => socket.attachedChannels()).toEqual([`rpg:${GAME_CHAT}`]);
  await expect(page.getByTestId("rpg-events")).toHaveText("gameChanged");
  // …and NO gap-heal on the room's first live edge (BOOT-4X). The frame above is the barrier: it is
  // delivered strictly after the room went live, so a heal would already be counted here if one had fired.
  // ONESHOT-OK: settled by the frame-delivery assertion above.
  expect(await page.getByTestId("rpg-heals").textContent()).toBe("0");
});

test("the always-on user room attaches unconditionally and receives its own frames", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  await expect.poll(() => socket.attachedChannels()).toEqual(["user"]);
  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
});

test("TWO rooms cost ONE connect, and each room's frames reach only its own consumer", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME, RPG_FRAME], awaitAttaches: 2 });

  await mount(<TwoRoomStory chatId={GAME_CHAT} />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  await expect(page.getByTestId("rpg-events")).toHaveText("gameChanged");
  // THE claim: adding the second room added zero connections.
  expect(socket.connects()).toBe(1);
  expect(socket.attachedChannels().toSorted()).toEqual([`rpg:${GAME_CHAT}`, "user"]);
});

// ── W1: the SUBSCRIPTION path is a session sensor ────────────────────────────────────────────────────
// The defect this pins (staleness-and-session-freshness.md §2.3 hole 2): the socket's UNAUTHORIZED was the
// ONLY signal a warm tab ever got that its cookie had died — with `staleTime: Infinity` and
// `refetchOnWindowFocus: false` (D54) it issues no reads, so the QueryCache belt has nothing to fire on —
// and it ended at `notify.error`. A toast, then business as usual on a dead session. RED-FIRST RECEIPT:
// against HEAD both assertions below fail (`/api/auth/me` is never requested), which is the defect stated
// as a network fact rather than a source reading.

/** Stub the public session probe + count its hits — the observable that recovery ENTERED. */
async function routeAuthMe(page: Page, authenticated: boolean): Promise<() => number> {
  let hits = 0;
  await page.route("**/api/auth/me", async (route) => {
    hits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated, handle: authenticated ? "owner" : null, role: authenticated ? "owner" : null }),
    });
  });
  return (): number => hits;
}

/** The typed terminal frame the socket yields on a fault, authored at the code under test. */
const errorFrame = (code: string): SubscriptionErrorPayload => ({ __subscriptionError: true, code, message: `socket over: ${code}` });

test("an UNAUTHORIZED socket fault ENTERS the recovery ladder (it used to stop at a toast)", async ({ mount, page }) => {
  const authMe = await routeAuthMe(page, true);
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  // The user frame rides AFTER the error frame, so seeing it rendered proves the error frame was already
  // routed — the strict barrier an "and then this happened" assertion needs.
  await routeOrbSocket(page, { frames: [errorFrame("UNAUTHORIZED"), USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  await expect.poll(() => authMe()).toBeGreaterThan(0);
});

test("a NON-auth socket fault still only degrades the room — no session probe", async ({ mount, page }) => {
  const authMe = await routeAuthMe(page, true);
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  await routeOrbSocket(page, { frames: [errorFrame("INTERNAL_SERVER_ERROR"), USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  // Same barrier: the user frame is strictly after the fault, so its arrival settles "the fault has been
  // handled". Only UNAUTHORIZED is a session verdict; everything else keeps its room-degradation handling.
  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  expect(authMe()).toBe(0);
});

// ── #222: ONE SOCKET FAULT, ONE ALERT ────────────────────────────────────────────────────────────────
// The producer-dedupe sibling of #215. #215 killed the ANNOUNCE-failure duplication (N rooms each reporting
// one cap refusal); this is the other emitter of the same class and it survived that fix: the typed
// `__subscriptionError` terminal frame used to go to `roomRegistry.failed(message)` with NO ref, which the
// registry fanned to EVERY joined room, and every room hook's `onError` is a `notify.error`. So one socket
// death produced N byte-identical toasts of the SERVER'S OWN SENTENCE, with no remedy — `socketNotice`, the
// copy that speaks in tabs and carries "Try again", was never consulted on this path at all.
//
// THE PIN THIS REPLACES (recorded here so the reversal is legible, not silent). `use-orb-socket.ts` said:
// "Every room loses freshness, so every room's consumer hears it; the reconnect's gap-heal closes the data
// gap when the client re-subscribes", and `room-registry.test.ts` asserted "a SOCKET fault reaches every
// room". The PURPOSE was freshness recovery — which `onSocketLive`'s gap-heal already owns, at room
// granularity, on the re-connect edge. What the fan-out actually bought was the duplication, plus a false
// terminal state one surface over (`bundle-workload-tracker` answered a recoverable socket blip with "The
// import stream ended"). So a socket fault is now the SOCKET's story, told once; `failed()` keeps its ref
// and stays what a per-ROOM `roomFailed` reaches.

test("ONE socket fault raises ONE alert, and it is the socket's own copy — not N rooms repeating the server (#222)", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  // The fault rides FIRST and the two room frames after it, so both rooms rendering their event is the
  // barrier: the error frame was already routed when those arrived (the W1 tests' idiom above).
  await routeOrbSocket(page, { frames: [errorFrame("INTERNAL_SERVER_ERROR"), USER_FRAME, RPG_FRAME], awaitAttaches: 2 });

  await mount(<SocketFaultToastStory chatId={GAME_CHAT} />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  await expect(page.getByTestId("rpg-events")).toHaveText("gameChanged");

  // TWO rooms are joined (the barrier above proves both), so the old fan-out rendered two toasts here.
  const toasts = page.locator('[data-slot="toast-root"]');
  await expect(toasts).toHaveCount(1);
  // …and it is `socketNotice`'s notice: a title that scans, the server's sentence demoted to the
  // description, and the one action that re-subscribes.
  await expect(toasts.locator('[data-slot="toast-title"]')).toHaveText("Lost the live connection");
  await expect(toasts).toContainText("socket over: INTERNAL_SERVER_ERROR");
  await expect(toasts.locator('[data-slot="toast-action"]')).toHaveText("Try again");
});

test("a SIBLING stream stub does not eat the socket — both route on the PROCEDURE (#1491)", async ({ mount, page }) => {
  // THE DEFECT: both stubs registered `**/api/trpc/**` and branched on the ACCEPT HEADER alone, so whichever
  // was installed LAST answered every tRPC subscription in the test — playwright runs route handlers in
  // reverse registration order. A story that opens the socket while the impersonation stub is installed
  // therefore got impersonation deltas on its socket, and any CT that "passed" that way was measuring the
  // stub's reach, not the app. Registering the impersonate stub SECOND is the exact collision; the socket
  // must still connect, and the impersonate recorder must never see a request.
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME], awaitAttaches: 1 });
  const impersonation = await routeImpersonateStream(page, ["never served"]);

  await mount(<UserBusStory />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  await expect.poll(() => socket.connects()).toBe(1);
  expect(impersonation.count(), "the impersonate stub answered a stream that is not chat.impersonateStream").toBe(0);
});

test("the TWIN: the socket stub registered LAST still lets an impersonate stream through (#1491)", async ({ mount, page }) => {
  // THE OTHER HALF OF THE SAME COLLISION, and the one the arm above cannot see. Playwright runs route
  // handlers in REVERSE registration order, so registering the impersonate stub second (as that arm does)
  // puts the IMPERSONATE handler first — and it falls through for everything that is not
  // `chat.impersonateStream`. That arm therefore proves the impersonate stub's narrowness and says NOTHING
  // about the socket stub's: with `isOrbSocketRequest` reverted to the accept-header-only match, it stays
  // 11/0 green. Registering the SOCKET stub last inverts the order, so the socket handler decides first and
  // its predicate is what is on trial.
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const impersonation = await routeImpersonateStream(page, ["I step into the tavern."]);
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);
  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");

  // The impersonate subscription's OWN wire shape (an EventSource GET on that procedure — what
  // httpSubscriptionLink opens; this story mounts no composer, so the request is made directly rather than
  // through a second feature's UI). The socket handler sees it FIRST and must fall through.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const source = new EventSource(`/api/trpc/chat.impersonateStream?input=${encodeURIComponent(JSON.stringify({ chatId: "chat_ct_game_01" }))}`);
      const done = (): void => {
        source.close();
        resolve();
      };
      source.addEventListener("message", done);
      source.addEventListener("error", done);
    });
  });

  // THE ASSERTION: the impersonate stub served it — i.e. the socket stub declined a procedure that is not
  // `stream.connect`. Reverting `isOrbSocketRequest` makes this 0 (the socket answers it with socket frames).
  await expect.poll(() => impersonation.count()).toBe(1);
  // …and the socket itself is untouched: one connect, still the same one room.
  await expect.poll(() => socket.connects()).toBe(1);
  await expect.poll(() => socket.attachedChannels()).toEqual(["user"]);
});

test("a frame for a room nobody joined is dropped, not fanned out", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  // The socket serves an rpg frame while only the USER room is joined — the real server never would, and the
  // registry must not route it into a consumer that never asked for that room.
  const socket = await routeOrbSocket(page, { frames: [RPG_FRAME, USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  expect(socket.attachedChannels()).toEqual(["user"]);
});
