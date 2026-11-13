// The temporary-chat sweep and admitted room work exclude each other on the server, as the husk reap does: a sweep
// past the TTL never deletes a room while a turn runs in it, and picks the room up on a later pass; a send that
// meets the sweep's delete is refused as a closing room.
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/substrate/handoff-barrier.ts

import { TURN_ROOM_CLOSING_OP_CODE } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { MS_PER_HOUR, UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { createChatRoot, freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { textProvider, textRoom } from "../scenario-physical.ts";

const ROOM_DELETE = /^delete from "chats"/u;
const NOT_FOUND = { code: "NOT_FOUND" } as const;
const REPLY = "The reply.";

// The root's own room is a husk the sweep would also reap; titling it claims it, so the sweep's cohort is the
// temporary rooms each case opens.
async function temporaryRooms(h: ChatRoot, count: number): Promise<ChatId[]> {
  await h.caller.chat.updateTitle({ chatId: h.chatId, title: "Kept" });
  const characterIds = h.characters.map(({ id }) => id);
  const rooms: ChatId[] = [];
  for (let i = 0; i < count; i += 1) {
    rooms.push((await h.caller.chat.startChat({ characterIds, opening: "none", temporary: true })).chat.id);
  }
  return rooms;
}

// Move the clock past the owner's own temporary-chat TTL, so every room opened so far has expired.
async function expireTemporaryRooms(h: ChatRoot): Promise<void> {
  const { tempChatTtlHours } = (await h.caller.settings.getUserSettings()).config.chat;
  h.root.clock.advance(tempChatTtlHours * MS_PER_HOUR + 1);
}

test("a sweep past the TTL keeps a temporary room whose turn is still running and deletes an idle one, and a sweep after the turn settles deletes it", async () => {
  using provider = textProvider([REPLY]);
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // The chat completion waits, so the send holds the room's admitted work until the test lets it finish.
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
      arrived.resolve();
      await release.promise;
    }
    return await provider.execute(request);
  };
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch });
  const [busy, idle] = await temporaryRooms(h, 2);
  if (busy === undefined || idle === undefined) {
    throw new Error("the case opened fewer than two temporary rooms");
  }
  await expireTemporaryRooms(h);

  const sending = h.caller.chat.send({ chatId: busy, content: "hello", timeZone: UTC_TIME_ZONE });
  const sent = Promise.allSettled([sending]);
  try {
    await arrived.promise;
    expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
    await expect(h.caller.chat.getChat({ chatId: idle })).rejects.toMatchObject(NOT_FOUND);
    expect(await h.caller.chat.getChat({ chatId: busy })).toMatchObject({ id: busy });
  } finally {
    release.resolve();
    await sent;
  }
  await sending;
  await h.root.settleBackground();
  expect((await readRoomCanon(h.root, h.owner, busy)).map(({ content }) => content)).toEqual(["hello", REPLY]);

  expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
  await expect(h.caller.chat.getChat({ chatId: busy })).rejects.toMatchObject(NOT_FOUND);
});

test("a send that arrives while the sweep is deleting a temporary room is refused as a closing room, and one after finds no room", async () => {
  using held = await freshHeldDb();
  await using h = await textRoom([], { server: { db: held.db } });
  const [room] = await temporaryRooms(h, 1);
  if (room === undefined) {
    throw new Error("the case opened no temporary room");
  }
  await expireTemporaryRooms(h);
  const roomDelete = held.hold(ROOM_DELETE);

  const sweeping = h.caller.chat.reapTemporaryChats();
  await roomDelete.reached;
  await expect(h.caller.chat.send({ chatId: room, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    cause: { code: TURN_ROOM_CLOSING_OP_CODE },
  });
  roomDelete.release();
  expect(await sweeping).toEqual({ reaped: 1 });

  await expect(h.caller.chat.send({ chatId: room, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject(NOT_FOUND);
  await expect(h.caller.chat.getChat({ chatId: room })).rejects.toMatchObject(NOT_FOUND);
});
