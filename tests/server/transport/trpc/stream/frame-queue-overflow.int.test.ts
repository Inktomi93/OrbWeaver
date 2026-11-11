// A socket that cannot keep up gets the policy of each room's source: a resumable room is told it lagged, at its
// delivered watermark, and then gets what it missed; a live-only room folds repeats of an event into the newest one.
// The live-only case stays under the queue's shared bound, which is private to the queue and which a live-only room alone
// cannot reach (it holds at most one frame per event type), so the announce-at-the-bound branch of the collapse policy
// has no test here.
// @subject packages/server/src/transport/trpc/stream/frame-queue.ts
// @subject packages/server/src/transport/trpc/stream/socket.ts

import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
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

    await device.waitFor(() => device.lags.length > 0 && missed.every((id) => committedIds().includes(id)));

    // The notice names the seq of the last frame the device was handed before it, and every missed message arrives
    // after the notice, once, by replay.
    const [lag] = device.lags;
    expect(device.lags).toHaveLength(1);
    expect(present(lag).cursor).toBe(present(device.frames[present(lag).chatFramesBefore - 1]).seq);
    expect(missed).toHaveLength(MISSED_MESSAGES);
    expect(committedIds().filter((id) => missed.includes(id))).toHaveLength(MISSED_MESSAGES);
    for (const id of missed) {
      expect(device.frames.findIndex(({ event }) => event.type === "messageCommitted" && event.messageId === id)).toBeGreaterThanOrEqual(
        present(lag).chatFramesBefore,
      );
    }
  } finally {
    await device.close();
  }
}, 20_000);

test("a live-only room that outruns its reader folds repeated events into the newest one and, under the bound, is not told it lagged", async () => {
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
    expect(device.lags).toEqual([]);
  } finally {
    await device.close();
  }
}, 20_000);
