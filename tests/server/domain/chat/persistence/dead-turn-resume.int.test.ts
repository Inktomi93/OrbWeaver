// A process that dies mid-turn leaves the log's rows and no terminal. A resume on the new process must not reopen them.
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts

import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";
import { openDevice, openRoom, textOf, typesOf } from "../../../transport/trpc/stream/_held-room.ts";

test("a turn a restart killed names no open turn, and a resume does not reopen it", async () => {
  await using room = await openRoom();
  const dead = room.root.ids.typeId(ID_PREFIX.chatTurn);
  const accepted = { type: "turnAccepted", chatId: room.chatId, turnId: dead, intent: "send", speakerCharacterId: null, targetMessageId: null };
  const token = {
    type: "delta",
    chatId: room.chatId,
    turnId: dead,
    slotSeq: 1,
    delta: { chatId: room.chatId, kind: "text", text: "A dead turn's token." },
    memberText: null,
  };
  // What a process that died mid-turn leaves: the rows, with no terminal, and a new process that never saw them.
  await room.root.db.run(sql`insert into chat_events (id, chat_id, seq, type, payload) values
    (${room.root.ids.typeId(ID_PREFIX.chatEvent)}, ${room.chatId}, 901, 'turnAccepted', ${JSON.stringify(accepted)}),
    (${room.root.ids.typeId(ID_PREFIX.chatEvent)}, ${room.chatId}, 902, 'delta', ${JSON.stringify(token)})`);
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    const caller = await room.root.internalCallerFor(room.host.userId);
    await caller.stream.attach({ socketId: device.socketId, ref: { channel: "chat", chatId: room.chatId }, sinceSeq: 900 });
    await device.waitFor((frames) => typesOf(frames).includes("chatOpened"));
    await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the barrier row" });
    await device.waitFor((frames) => typesOf(frames).includes("messageCommitted"));
    expect(device.frames[0]?.event).toMatchObject({ type: "chatOpened", openTurnIds: [] });
    expect(typesOf(device.frames)).not.toContain("turnAccepted");
    expect(textOf(device.frames)).toBe("");
  } finally {
    await device.close();
  }
});
