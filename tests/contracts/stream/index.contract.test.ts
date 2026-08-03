// @orb/contracts/stream — the multiplexed SSE transport vocabulary (SSE-1 §3). Pins the three things every
// later stage of the fold depends on and that nothing else can catch:
//   • STREAM_CHANNELS is EXACTLY the room-ref channel set — the belt the server's `ROOM_SOURCES` Record and
//     the client's handler registry are both total over. A channel added to the ref union without a belt
//     entry fails the `satisfies` at the declaration; a belt entry for a channel the union DROPPED is caught
//     here (the reverse direction the `satisfies` cannot see).
//   • `roomKey` is the ONE routing key, and it separates the two chat-scoped rooms of the SAME chat — the
//     whole point of nesting rather than flattening (rpg and chat share a chatId and must never collide).
//   • the three proc input schemas actually validate the trust boundary (a bogus channel is refused, a
//     chat-scoped ref without its chatId is refused, `sinceSeq` is a non-negative integer or absent).

import type { StreamRoomRef } from "@orb/contracts/stream";
import { roomKey, STREAM_CHANNELS, streamAttachInputSchema, streamConnectInputSchema, streamDetachInputSchema } from "@orb/contracts/stream";
import type { ChatId, SocketId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_A = castId<ChatId>("chat_aaa");
const CHAT_B = castId<ChatId>("chat_bbb");
const RUN = castId<WorkloadId>("workload_aaa");
const SOCKET = castId<SocketId>("f7a1c0de-0000-4000-8000-000000000001");

test("STREAM_CHANNELS is exactly the room-ref channel set (both directions)", () => {
  // Every channel the ref union can carry, enumerated by hand — the reverse of the declaration's
  // `satisfies readonly StreamChannel[]`, so a DROPPED union member reds here.
  const known: StreamRoomRef["channel"][] = ["user", "notifications", "chat", "rpg", "automation", "workloads"];
  expect(new Set(STREAM_CHANNELS)).toEqual(new Set(known));
  // `control` is a FRAME channel, never a room — it must not be attachable.
  expect(STREAM_CHANNELS).not.toContain("control");
});

test("roomKey separates the self-scoped rooms, the per-chat rooms, and the two channels of one chat", () => {
  expect(roomKey({ channel: "user" })).toBe("user");
  expect(roomKey({ channel: "notifications" })).toBe("notifications");
  expect(roomKey({ channel: "chat", chatId: CHAT_A })).toBe(`chat:${CHAT_A}`);
  // The nesting invariant: one chat's message room and its game room are DIFFERENT rooms.
  expect(roomKey({ channel: "rpg", chatId: CHAT_A })).not.toBe(roomKey({ channel: "chat", chatId: CHAT_A }));
  // …and the same channel on two chats is two rooms.
  expect(roomKey({ channel: "rpg", chatId: CHAT_A })).not.toBe(roomKey({ channel: "rpg", chatId: CHAT_B }));
  // The third SCOPING shape (S5): a room keyed by a workloadId, not a chatId. It gets its own arm rather
  // than falling into the chat-scoped one — the projection is total by NAME, never by "has an id".
  expect(roomKey({ channel: "workloads", workloadId: RUN })).toBe(`workloads:${RUN}`);
});

test("connect/detach accept a well-formed ref and refuse an unknown channel", () => {
  expect(streamConnectInputSchema.safeParse({ socketId: SOCKET }).success).toBe(true);
  expect(streamConnectInputSchema.safeParse({ socketId: "" }).success).toBe(false);
  expect(streamDetachInputSchema.safeParse({ socketId: SOCKET, ref: { channel: "user" } }).success).toBe(true);
  expect(streamDetachInputSchema.safeParse({ socketId: SOCKET, ref: { channel: "control" } }).success).toBe(false);
});

test("attach demands the chatId on a chat-scoped ref and bounds sinceSeq", () => {
  const base = { socketId: SOCKET };
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "rpg" } }).success).toBe(false);
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "rpg", chatId: CHAT_A } }).success).toBe(true);
  // A replay request from the beginning is legal; a negative / fractional cursor is not.
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "chat", chatId: CHAT_A }, sinceSeq: 0 }).success).toBe(true);
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "chat", chatId: CHAT_A }, sinceSeq: -1 }).success).toBe(false);
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "chat", chatId: CHAT_A }, sinceSeq: 1.5 }).success).toBe(false);
  // Omitted / explicit null = live-only from now.
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "user" }, sinceSeq: null }).success).toBe(true);
  // The workloads room is keyed by a workloadId: a chatId does not open it, and its own id is required.
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "workloads" } }).success).toBe(false);
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "workloads", chatId: CHAT_A } }).success).toBe(false);
  expect(streamAttachInputSchema.safeParse({ ...base, ref: { channel: "workloads", workloadId: RUN } }).success).toBe(true);
});
