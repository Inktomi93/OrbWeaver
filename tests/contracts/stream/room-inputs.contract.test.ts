import type { StreamRoomRef } from "@orb/contracts/stream";
import { roomKey, streamAttachInputSchema, streamConnectInputSchema, streamDetachInputSchema } from "@orb/contracts/stream";
import { ID_PREFIX, mintSocketId, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("connect requires a nonempty socket identity and attach/detach retain every room's routing fields", ({ ids }) => {
  const socketId = mintSocketId(ids.next);
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const workloadId = mintTypeId(ID_PREFIX.workload, ids.next);
  expect(streamConnectInputSchema.parse({ socketId })).toStrictEqual({ socketId });
  for (const input of [{}, { socketId: "" }, { socketId: 1 }]) {
    expect(streamConnectInputSchema.safeParse(input).success).toBe(false);
  }
  const rooms = [
    { ref: { channel: "user" }, key: "user" },
    { ref: { channel: "notifications" }, key: "notifications" },
    { ref: { channel: "chat", chatId }, key: `chat:${chatId}` },
    { ref: { channel: "rpg", chatId }, key: `rpg:${chatId}` },
    { ref: { channel: "automation", chatId }, key: `automation:${chatId}` },
    { ref: { channel: "workloads", workloadId }, key: `workloads:${workloadId}` },
  ] satisfies readonly { readonly ref: StreamRoomRef; readonly key: string }[];
  for (const { ref, key } of rooms) {
    const input = { socketId, ref };
    const attached = streamAttachInputSchema.parse(input);
    const detached = streamDetachInputSchema.parse(input);
    expect(attached).toStrictEqual(input);
    expect(detached).toStrictEqual(input);
    expect(roomKey(attached.ref)).toBe(key);
    expect(roomKey(detached.ref)).toBe(key);
    expect(streamAttachInputSchema.safeParse({ ...input, socketId: "" }).success).toBe(false);
    expect(streamDetachInputSchema.safeParse({ ...input, socketId: "" }).success).toBe(false);
  }
  const otherChatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const otherWorkloadId = mintTypeId(ID_PREFIX.workload, ids.next);
  expect(roomKey({ channel: "chat", chatId: otherChatId })).not.toBe(roomKey({ channel: "chat", chatId }));
  expect(roomKey({ channel: "workloads", workloadId: otherWorkloadId })).not.toBe(roomKey({ channel: "workloads", workloadId }));
  expect(roomKey({ channel: "automation", chatId, event: { type: "rulesChanged", chatId } })).toBe(`automation:${chatId}`);
});

test("attach and detach refuse frame-only channels and missing, malformed or wrong-family room identities", ({ ids }) => {
  const socketId = mintSocketId(ids.next);
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const workloadId = mintTypeId(ID_PREFIX.workload, ids.next);
  const refused = [
    { channel: "control" },
    { channel: "invented" },
    { channel: "workloads" },
    { channel: "workloads", chatId },
    { channel: "workloads", workloadId: chatId },
    { channel: "workloads", workloadId: "workload_not-a-typeid" },
    ...["chat", "rpg", "automation"].flatMap((channel) => [
      { channel },
      { channel, workloadId },
      { channel, chatId: workloadId },
      { channel, chatId: "chat_not-a-typeid" },
    ]),
  ];
  expect(streamAttachInputSchema.parse({ socketId, ref: { channel: "chat", chatId } }).ref).toStrictEqual({ channel: "chat", chatId });
  expect(streamDetachInputSchema.parse({ socketId, ref: { channel: "workloads", workloadId } }).ref).toStrictEqual({ channel: "workloads", workloadId });
  for (const ref of refused) {
    expect(streamAttachInputSchema.safeParse({ socketId, ref }).success, JSON.stringify(ref)).toBe(false);
    expect(streamDetachInputSchema.safeParse({ socketId, ref }).success, JSON.stringify(ref)).toBe(false);
  }
});

test("attach distinguishes an omitted or null live cursor from zero replay and refuses negative or fractional cursors", ({ ids }) => {
  const base = { socketId: mintSocketId(ids.next), ref: { channel: "chat", chatId: mintTypeId(ID_PREFIX.chat, ids.next) } } as const;
  expect(streamAttachInputSchema.parse(base)).toStrictEqual(base);
  for (const sinceSeq of [null, 0, 7]) {
    expect(streamAttachInputSchema.parse({ ...base, sinceSeq })).toStrictEqual({ ...base, sinceSeq });
  }
  for (const sinceSeq of [-1, 0.5]) {
    expect(streamAttachInputSchema.safeParse({ ...base, sinceSeq }).success).toBe(false);
  }
});
