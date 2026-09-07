// useChatBus CT (data/bus/use-chat-bus.ts) — the ATTACH CURSOR FLOOR (R1-2), driven through the real
// production path: EventSource → httpSubscriptionLink → useOrbSocket → the room registry → useChatBus.
// routeOrbSocket stubs only the NETWORK, and the assertion is on the WIRE — the `stream.attach` input the
// re-announce actually sent — because that input IS the defect: a `sinceSeq` of null asks the server for no
// replay at all (`transport/trpc/stream/sources/chat.ts`: `if (resumeSeq === null) return`).
//
// THE HOLE THIS PINS. A room the client has never received a durable frame in has no high-water mark, so it
// used to re-announce with null forever. Open a chat → the SSE dies while HTTP lives (an eviction, a proxy
// idle-timeout, a backgrounded tab) → the user sends → the server commits the whole turn → the socket
// reconnects asking for nothing → the turn is INVISIBLE until a reload. The fix is a floor: the server
// stamps a cursor-less attach's `chatOpened` synthetic with the room's durable high-water, and this hook
// adopts that seq as the cursor to come back with.

import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeOrbSocket } from "../../../support/node/route-orb-socket.ts";
import { routeTrpc } from "../../../support/node/route-trpc.ts";
import { ChatBusAttachFloorStory } from "./_ct-stories.tsx";
import { STREAM_MUTATION_ROUTES } from "./fixtures.ts";

const CHAT = castId<ChatId>("chat_ctattachfloor");

/** The server's attach synthesis, verbatim: `chatOpened` carrying the room's durable high-water as its seq. */
const HIGH_WATER = 7;
const CHAT_OPENED: StreamFrame = { channel: "chat", chatId: CHAT, seq: HIGH_WATER, event: { type: "chatOpened", chatId: CHAT } };

test("a room dark since it opened re-announces with the SERVER-STAMPED floor, not with nothing", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES });
  // `awaitAttaches: 1` holds connection #1 open until the chat room has actually joined — otherwise the
  // drop can beat the attach and the frame lands for a room nobody is in (the registry drops it, correctly,
  // and the floor would never be adopted for reasons that have nothing to do with the code under test).
  const socket = await routeOrbSocket(page, { frames: [CHAT_OPENED], awaitAttaches: 1, dropFirstConnection: true });

  await mount(<ChatBusAttachFloorStory chatId={CHAT} />);
  await expect(page.getByTestId("chat-bus-mounted")).toHaveText(CHAT);

  // The FIRST attach is cursor-less by design: this client holds the canon from its own read, and asking to
  // replay from zero on every chat open would re-deliver the entire log.
  await expect.poll(() => socket.attachRequests().length).toBeGreaterThan(0);
  expect(socket.attachRequests()[0]?.sinceSeq).toBeNull();

  // Connection #1 EOFs (no terminal `return` frame) → the link reconnects → the registry re-announces every
  // joined room, re-reading the `sinceSeq` thunk. THIS is the request that used to be null.
  await expect.poll(() => socket.connects(), { timeout: 15_000 }).toBeGreaterThan(1);
  await expect.poll(() => socket.attachRequests().length, { timeout: 15_000 }).toBeGreaterThan(1);

  const reannounce = socket.attachRequests().at(-1);
  expect(reannounce?.ref).toEqual({ channel: "chat", chatId: CHAT });
  expect(reannounce?.sinceSeq).toBe(HIGH_WATER);
});
