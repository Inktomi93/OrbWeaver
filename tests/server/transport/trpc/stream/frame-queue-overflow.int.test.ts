// A socket that cannot keep up gets the policy of each room's source: a resumable room is told it lagged and then
// gets what it missed from its delivered watermark; a live-only room collapses to its newest event and is never told.
// @subject packages/server/src/transport/trpc/stream/frame-queue.ts
// @subject packages/server/src/transport/trpc/stream/socket.ts

import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { openDevice, openRoom } from "./_held-room.ts";

// Far above what the queue holds, so the reader's idle socket overflows it. A bound that outgrew this would leave
// the resumable case without a lag notice, which fails the test instead of passing it.
const FLOOD = 4096;
const MISSED_MESSAGES = 3;

/** Let every already-queued microtask finish. The pumps do no I/O for these events, so one macrotask turn is
 *  enough for each of them to have pushed everything the bus holds into the queue. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("a resumable room that outruns its reader is told it lagged and then receives what it missed", async () => {
  await using room = await openRoom();
  const device = await openDevice(room, room.hostSeat);
  try {
    await device.attach();
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "chatOpened"));
    for (let index = 0; index < FLOOD; index += 1) {
      room.root.app.liveBuses.chat.publishChatEvent({ seq: null, event: { type: "chatDeleted", chatId: room.chatId } });
    }
    await flush();
    // The shed has parked the room's pump, so these reach the reader only through the durable replay.
    const missed: MessageId[] = [];
    for (let index = 0; index < MISSED_MESSAGES; index += 1) {
      const committed = await room.root.services.chat.commitMessage({
        principal: room.host,
        chatId: room.chatId,
        content: `Missed while saturated ${String(index)}.`,
      });
      missed.push(...committed.messages.map(({ id }) => id));
    }
    const committedIds = (): readonly MessageId[] => device.frames.flatMap(({ event }) => (event.type === "messageCommitted" ? [event.messageId] : []));

    await device.waitFor(() => device.lagCursors.length > 0 && missed.every((id) => committedIds().includes(id)));

    expect(device.lagCursors).toHaveLength(1);
    expect(missed).toHaveLength(MISSED_MESSAGES);
    expect(committedIds().filter((id) => missed.includes(id))).toHaveLength(MISSED_MESSAGES);
  } finally {
    await device.close();
  }
}, 20_000);

test("a live-only room that outruns its reader collapses to its newest event and is never told it lagged", async () => {
  await using room = await openRoom();
  const device = await openDevice(room, room.hostSeat);
  try {
    const caller = await room.root.internalCallerFor(room.hostSeat.id);
    await caller.stream.attach({ socketId: device.socketId, ref: { channel: "user" } });
    await flush();
    const tagIds = Array.from({ length: FLOOD }, () => room.root.ids.typeId(ID_PREFIX.tag));
    for (const tagId of tagIds) {
      room.root.app.liveBuses.user.publishUserEvent(room.hostSeat.id, { type: "tagsChanged", tagId });
    }
    await flush();
    const newest = tagIds.at(-1);

    await device.waitFor(() => device.userEvents.at(-1)?.tagId === newest);

    expect(device.userEvents.length).toBeLessThan(FLOOD);
    expect(device.userEvents.at(-1)).toEqual({ type: "tagsChanged", tagId: newest });
    expect(device.lagCursors).toEqual([]);
  } finally {
    await device.close();
  }
}, 20_000);
