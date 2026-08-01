// The bounded merge queue (transport/trpc/stream/frame-queue.ts). One socket is one consumer for N
// producers, so THE question is what happens when it saturates — and the answer must never be "a frame
// silently disappeared". Each policy is pinned against the healing story that makes it legal:
//   • `lag`      (chat/notifications) sheds the room's tail and says so, carrying the room's last-DELIVERED
//                DURABLE cursor, and calls back (`onShed`) so the socket can park that room and resume it
//                there — the replay from that cursor is what refills the gap. It sheds ONLY that room.
//   • `collapse` (user/rpg/automation) keeps at most one pending frame per (room, event type) — legal only
//                because every one of those handlers is a pure invalidation trigger.
// Plus the two ordering guarantees: FIFO within a room, and control frames never stuck behind a flood.

import type { StreamDataFrame, StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { FrameQueue } from "@orb/server/transport/trpc";
import { createFrameQueue, OVERFLOW_POLICIES } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

const CHAT = castId<ChatId>("chat_q1");
const OTHER_CHAT = castId<ChatId>("chat_q2");
const USER_ROOM: StreamRoomRef = { channel: "user" };
const RPG_ROOM: StreamRoomRef = { channel: "rpg", chatId: CHAT };
const CHAT_ROOM: StreamRoomRef = { channel: "chat", chatId: CHAT };
const OTHER_CHAT_ROOM: StreamRoomRef = { channel: "chat", chatId: OTHER_CHAT };

const userFrame = (type: "chatsChanged" | "tagsChanged"): StreamDataFrame => ({ channel: "user", event: { type } });
const chatFrame = (seq: number): StreamDataFrame => ({ channel: "chat", chatId: CHAT, seq, event: { type: "chatOpened", chatId: CHAT } });
const otherChatFrame = (seq: number): StreamDataFrame => ({ channel: "chat", chatId: OTHER_CHAT, seq, event: { type: "chatOpened", chatId: OTHER_CHAT } });

/** Read every frame currently buffered (the queue is closed first so the drain terminates). */
async function flush(queue: FrameQueue): Promise<StreamFrame[]> {
  queue.close();
  const out: StreamFrame[] = [];
  for await (const frame of queue.drain()) {
    out.push(frame);
  }
  return out;
}

test("the policy table is the documented one (a channel that carries CONTENT never collapses)", () => {
  expect(OVERFLOW_POLICIES).toEqual({
    user: "collapse",
    notifications: "lag",
    chat: "lag",
    rpg: "collapse",
    automation: "collapse",
  });
});

describe("the `lag` policy — durable rooms", () => {
  test("on overflow it sheds THAT room's tail, announces roomLagged with its cursor, and keeps the room", async () => {
    const queue = createFrameQueue({ capacity: 2, cursorFor: (key) => (key === `chat:${CHAT}` ? 17 : null) });
    queue.push(CHAT_ROOM, chatFrame(16));
    queue.push(CHAT_ROOM, chatFrame(17));

    queue.push(CHAT_ROOM, chatFrame(18)); // over capacity

    const frames = await flush(queue);
    // Both pending rows are gone — the durable replay from `cursor` is what refills them.
    expect(frames).toEqual([{ channel: "control", type: "roomLagged", ref: CHAT_ROOM, cursor: 17 }]);
  });

  test("an overflowing room never sheds ANOTHER room's pending frames", async () => {
    const queue = createFrameQueue({ capacity: 2, cursorFor: () => 5 });
    queue.push(OTHER_CHAT_ROOM, otherChatFrame(1));
    queue.push(CHAT_ROOM, chatFrame(1));

    queue.push(CHAT_ROOM, chatFrame(2)); // over capacity — sheds CHAT_ROOM only

    const frames = await flush(queue);
    expect(frames).toEqual([otherChatFrame(1), { channel: "control", type: "roomLagged", ref: CHAT_ROOM, cursor: 5 }]);
  });

  test("a shed CALLS BACK once per notice — the socket's hook for parking the room until the client catches up", () => {
    // `onShed` is the whole legality of `lag`: the shedding pump's high-water mark has passed the dropped
    // rows, so only the socket restarting that room from its last-DELIVERED cursor can refill them. It must
    // fire with the shed room's ref, and it must NOT re-fire while a notice is still pending — a flood the
    // consumer is not draining would otherwise call back on every push.
    const shed: StreamRoomRef[] = [];
    const queue = createFrameQueue({ capacity: 2, cursorFor: () => 3, onShed: (ref) => shed.push(ref) });
    queue.push(CHAT_ROOM, chatFrame(1));
    queue.push(CHAT_ROOM, chatFrame(2));

    queue.push(CHAT_ROOM, chatFrame(3)); // over capacity → shed + notice + callback
    queue.push(CHAT_ROOM, chatFrame(4));
    queue.push(CHAT_ROOM, chatFrame(5));
    queue.push(CHAT_ROOM, chatFrame(6)); // over capacity again, but the first notice is STILL pending

    expect(shed).toEqual([CHAT_ROOM]);
  });

  test("frames within one room stay FIFO", async () => {
    const queue = createFrameQueue({ capacity: 10, cursorFor: () => null });
    queue.push(CHAT_ROOM, chatFrame(1));
    queue.push(CHAT_ROOM, chatFrame(2));
    queue.push(CHAT_ROOM, chatFrame(3));

    expect(await flush(queue)).toEqual([chatFrame(1), chatFrame(2), chatFrame(3)]);
  });
});

describe("the `collapse` policy — pure-invalidation rooms", () => {
  test("keeps exactly ONE pending frame per (room, type), newest payload, original FIFO position", async () => {
    const queue = createFrameQueue({ capacity: 10, cursorFor: () => null });
    const first: StreamDataFrame = { channel: "user", event: { type: "chatsChanged", chatId: CHAT } };
    queue.push(USER_ROOM, first);
    queue.push(USER_ROOM, userFrame("tagsChanged"));
    const newest: StreamDataFrame = { channel: "user", event: { type: "chatsChanged", chatId: OTHER_CHAT } };

    queue.push(USER_ROOM, newest);

    // Two frames, not three: the second `chatsChanged` REPLACED the first, in place.
    expect(await flush(queue)).toEqual([newest, userFrame("tagsChanged")]);
  });

  test("collapse is per ROOM — two rpg rooms of different chats never merge", async () => {
    const queue = createFrameQueue({ capacity: 10, cursorFor: () => null });
    const a: StreamDataFrame = { channel: "rpg", chatId: CHAT, event: { type: "gameChanged", chatId: CHAT } };
    const b: StreamDataFrame = { channel: "rpg", chatId: OTHER_CHAT, event: { type: "gameChanged", chatId: OTHER_CHAT } };

    queue.push(RPG_ROOM, a);
    queue.push({ channel: "rpg", chatId: OTHER_CHAT }, b);

    expect(await flush(queue)).toEqual([a, b]);
  });

  test("a genuinely new type on a full queue announces roomLagged instead of dropping silently", async () => {
    const queue = createFrameQueue({ capacity: 1, cursorFor: () => null });
    queue.push(USER_ROOM, userFrame("chatsChanged"));

    queue.push(USER_ROOM, userFrame("tagsChanged"));

    expect(await flush(queue)).toEqual([userFrame("chatsChanged"), { channel: "control", type: "roomLagged", ref: USER_ROOM, cursor: null }]);
  });
});

describe("control frames", () => {
  test("a FULL queue still admits an unrelated room's control frames", async () => {
    const queue = createFrameQueue({ capacity: 1, cursorFor: () => null });
    queue.push(CHAT_ROOM, chatFrame(1)); // queue is now full

    queue.pushControl({ channel: "control", type: "attached", ref: USER_ROOM });
    queue.pushControl({ channel: "control", type: "roomFailed", ref: OTHER_CHAT_ROOM, code: "NOT_FOUND", message: "gone" });

    const frames = await flush(queue);
    expect(frames).toContainEqual({ channel: "control", type: "attached", ref: USER_ROOM });
    expect(frames).toContainEqual({ channel: "control", type: "roomFailed", ref: OTHER_CHAT_ROOM, code: "NOT_FOUND", message: "gone" });
  });

  test("a sustained flood announces ONE roomLagged for the room, not one per dropped frame", async () => {
    const queue = createFrameQueue({ capacity: 1, cursorFor: () => 3 });
    queue.push(CHAT_ROOM, chatFrame(1));

    for (let i = 0; i < 50; i++) {
      queue.push(CHAT_ROOM, chatFrame(100 + i));
    }

    const lags = (await flush(queue)).filter((f) => f.channel === "control" && f.type === "roomLagged");
    expect(lags).toHaveLength(1);
  });
});

test("close() still delivers the frames already accepted, then ends", async () => {
  const queue = createFrameQueue({ capacity: 10, cursorFor: () => null });
  queue.push(USER_ROOM, userFrame("chatsChanged"));

  const frames = await flush(queue);

  expect(frames).toEqual([userFrame("chatsChanged")]);
  // …and a push after close is inert (a pump losing its race with teardown must not resurrect the queue).
  queue.push(USER_ROOM, userFrame("tagsChanged"));
  expect(queue.size()).toBe(0);
});
