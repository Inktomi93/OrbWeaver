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
import type { TrpcFixtureOutput, TrpcInput, TrpcWireOutput } from "../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../support/node/route-trpc.ts";
import { RpgBusStory, SocketFaultToastStory, TwoRoomStory, UserBusStory } from "./_ct-stories.tsx";
import { STREAM_MUTATION_ROUTES } from "./fixtures.ts";

const GAME_CHAT = castId<ChatId>("chat_ct_game_01");
const PLAIN_CHAT = castId<ChatId>("chat_ct_plain_01");
const DISENGAGED_CHAT = castId<ChatId>("chat_ct_off_01");

/** `chat.getChat` shaped for the pointer gate's THREE states: a live game, a chat with no pointer at all,
 *  and — the case the old re-spelled null-check got wrong — a chat whose game is present but TOGGLED OFF. */
const getChat = (input: TrpcInput<"chat.getChat">): TrpcFixtureOutput<"chat.getChat"> => {
  const chatId = input.chatId;
  const rpg = ((): TrpcWireOutput<"chat.getChat">["rpg"] => {
    if (chatId === GAME_CHAT) {
      return { gameId: "rpg_game_ct", engaged: true };
    }
    if (chatId === DISENGAGED_CHAT) {
      return { gameId: "rpg_game_ct_off", engaged: false };
    }
    return null;
  })();
  return { id: chatId, title: "room", viewerUserId: "user_ct_socket", rpg };
};

const RPG_FRAME: StreamFrame = { channel: "rpg", chatId: GAME_CHAT, event: { type: "gameChanged", chatId: GAME_CHAT } };
const USER_FRAME: StreamFrame = { channel: "user", event: { type: "tagsChanged" } };

test("the LANDING state (no chat) attaches NO room but still holds exactly one socket", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={null} />);

  await expect.poll(() => socket.connects()).toBe(1);
  // The RENDERED settle for the gate's own input (#1849 — see THE BARRIER note above these three cases).
  await expect(page.getByTestId("rpg-pointer")).toHaveText("landing");
  // The gate: nothing attached. Under the old shape this was an un-assertable network fact.
  expect(await attachesHeldEmpty(socket)).toEqual([]);
});

// ── THE BARRIER FOR THE THREE NO-ATTACH CASES (#1849) ────────────────────────────────────────────────
//
// An ABSENCE assertion is only as good as what settles it, and these three had the two wrong halves at once:
//
//   • `expect.poll(() => socket.attachedChannels()).toEqual([])` PASSES ON ITS FIRST EVALUATION, because the
//     set starts empty. `poll` retries until it passes, so a room that attached one tick LATER was never
//     seen. That is a fence, not a defect proof — and it is where a 1-in-541 red hides: whichever of the
//     surrounding assertions is genuinely racy gets blamed for a gate nothing was actually watching.
//   • the settle they used was `trpc.count("chat.getChat") > 0`, a NODE-side count that ticks when the route
//     handler SERVED the request — strictly before the browser parsed it, re-rendered, and let the hook
//     decide. A node-side request count is never a browser-side settle.
//
// Both are replaced by the story's own RENDERED readout of the gate's INPUT (`rpg-pointer`, `_ct-stories.tsx`):
// it reads the same `chat.getChat` cache entry the hook reads, so its text going from `pending` to
// `engaged=<bool>` is the pointer having LANDED IN THIS DOCUMENT — the browser-side settle the old barrier
// was standing in for. The set is then sampled across a HELD window (`attachesHeldEmpty`) rather than read
// once, because "nothing happened" is a claim about an INTERVAL and a single read after a settle can still
// precede an attach the next task queues.

/** How long "no room attached" is held for, and how often it is sampled inside that window. */
const ABSENCE_HOLD_MS = 600;
const ABSENCE_SAMPLES = 6;

/** Every channel seen attached across the hold — `[]` iff the set stayed empty for the WHOLE window.
 *
 *  Spelled as a node-side sleep rather than `page.waitForTimeout` (biome's `noPlaywrightWaitForTimeout`)
 *  or a page-clock poll (the `test-determinism` gate bans an ambient clock in a test) — the
 *  `rules-section.ct.tsx` precedent. The elapsed time IS the mechanism: an absence has no rendered edge to
 *  wait on, so the only honest bound is a real interval over a recorder that only ever grows. */
async function attachesHeldEmpty(socket: { readonly attachedChannels: () => readonly string[] }): Promise<readonly string[]> {
  const seen = new Set<string>();
  for (let sample = 0; sample < ABSENCE_SAMPLES; sample += 1) {
    for (const channel of socket.attachedChannels()) {
      seen.add(channel);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ABSENCE_HOLD_MS / ABSENCE_SAMPLES);
    });
  }
  return [...seen];
}
test("a NON-GAME chat attaches NO rpg room — the gate the old hook only claimed to hold", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={PLAIN_CHAT} />);

  await expect.poll(() => socket.connects()).toBe(1);
  await expect(page.getByTestId("rpg-pointer")).toHaveText("engaged=false");
  expect(await attachesHeldEmpty(socket)).toEqual([]);
});

test("a DISENGAGED game (pointer present, `engaged:false`) attaches NO rpg room", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={DISENGAGED_CHAT} />);

  // THE regression this file exists for: the shipped gate was a re-spelled `rpg !== null`, so a game the user
  // had TOGGLED OFF (panel hidden, turn assembly clean, nothing rendered) still held a full always-on stream.
  // Every other consumer of this pointer goes through `isRpgEngaged`; this one has to agree with them — and
  // the readout below is `isRpgEngaged`'s OWN verdict on the pointer this stub served, so the barrier and the
  // gate cannot disagree about what "disengaged" meant.
  await expect.poll(() => socket.connects()).toBe(1);
  await expect(page.getByTestId("rpg-pointer")).toHaveText("engaged=false");
  expect(await attachesHeldEmpty(socket)).toEqual([]);
});

test("a GAME chat attaches exactly ONE rpg room, and its frames drive the invalidation seam", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [RPG_FRAME], awaitAttaches: 1 });

  await mount(<RpgBusStory chatId={GAME_CHAT} />);

  await expect.poll(() => socket.attachedChannels()).toEqual([`rpg:${GAME_CHAT}`]);
  await expect(page.getByTestId("rpg-events")).toHaveText("gameChanged");
  // …and NO gap-heal on the room's first live edge (BOOT-4X). The frame above is the barrier: it is
  // delivered strictly after the room went live, so a heal would already be counted here if one had fired.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the frame-delivery assertion above.
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
// The defect this pins (hole 2): the socket's UNAUTHORIZED was the
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

  // The impersonate subscription's OWN wire shape (the JSON POST `PostEventSource` sends for
  // httpSubscriptionLink; this story mounts no composer, so the request is made directly rather than through
  // a second feature's UI). The socket handler sees it FIRST and must fall through.
  await page.evaluate(async () => {
    const response = await fetch("/api/trpc/chat.impersonateStream", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ chatId: "chat_ct_game_01" }),
    });
    await response.text();
  });

  // THE ASSERTION: the impersonate stub served it — i.e. the socket stub declined a procedure that is not
  // `stream.connect`. Reverting `isOrbSocketRequest` makes this 0 (the socket answers it with socket frames).
  await expect.poll(() => impersonation.count()).toBe(1);
  expect(impersonation.firstInput()).toEqual({ chatId: "chat_ct_game_01" });
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
