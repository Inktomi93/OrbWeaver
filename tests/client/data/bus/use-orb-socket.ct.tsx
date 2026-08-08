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
import { routeOrbSocket } from "../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../support/ct/route-trpc.ts";
import { RpgBusStory, TwoRoomStory, UserBusStory } from "./_ct-stories.tsx";

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
  await routeTrpc(page, { "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={null} />);

  await expect.poll(() => socket.connects()).toBe(1);
  // The gate: nothing attached. Under the old shape this was an un-assertable network fact.
  await expect.poll(() => socket.attachedChannels()).toEqual([]);
});

test("a NON-GAME chat attaches NO rpg room — the gate the old hook only claimed to hold", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.getChat": getChat });
  const socket = await routeOrbSocket(page);

  await mount(<RpgBusStory chatId={PLAIN_CHAT} />);

  // Wait for the pointer read to actually RESOLVE (routeTrpc records it) — only then is "no rpg room
  // attached" a verdict rather than a race with a query that had not answered yet.
  await expect.poll(() => socket.connects()).toBe(1);
  await expect.poll(() => trpc.count("chat.getChat")).toBeGreaterThan(0);
  await expect.poll(() => socket.attachedChannels()).toEqual([]);
});

test("a DISENGAGED game (pointer present, `engaged:false`) attaches NO rpg room", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.getChat": getChat });
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
  await routeTrpc(page, { "chat.getChat": getChat });
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
  await routeTrpc(page, { "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  await expect.poll(() => socket.attachedChannels()).toEqual(["user"]);
  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
});

test("TWO rooms cost ONE connect, and each room's frames reach only its own consumer", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": getChat });
  const socket = await routeOrbSocket(page, { frames: [USER_FRAME, RPG_FRAME], awaitAttaches: 2 });

  await mount(<TwoRoomStory chatId={GAME_CHAT} />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  await expect(page.getByTestId("rpg-events")).toHaveText("gameChanged");
  // THE claim: adding the second room added zero connections.
  expect(socket.connects()).toBe(1);
  expect(socket.attachedChannels().toSorted()).toEqual([`rpg:${GAME_CHAT}`, "user"]);
});

test("a frame for a room nobody joined is dropped, not fanned out", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": getChat });
  // The socket serves an rpg frame while only the USER room is joined — the real server never would, and the
  // registry must not route it into a consumer that never asked for that room.
  const socket = await routeOrbSocket(page, { frames: [RPG_FRAME, USER_FRAME], awaitAttaches: 1 });

  await mount(<UserBusStory />);

  await expect(page.getByTestId("user-events")).toHaveText("tagsChanged");
  expect(socket.attachedChannels()).toEqual(["user"]);
});
