// @subject packages/server/src/domain/chat/verbs/turn.ts
// Actual saved bindings and credentials cross the physical wire; neither funder nor role resolution is replaced.
import { createCharacterSchema } from "@orb/contracts/character";
import { chatGenerationObservations, messages, ownerStats } from "@orb/db";
import { NoConnectionError } from "@orb/inference";
import { captureTurnRows } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { invitePerson } from "../persona-cache-physical.ts";
import { B_CHAT_MODEL, B_HOST_KEY, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

test("member-started automatic beats retain the actual initiator while the host funds each native call", async () => {
  await using room = await speakerRoom(
    { chat: ["Aria begins.", "Bryn replies.", "Aria continues.", "Bryn finishes."] },
    {
      group: { output: "per-speaker", policy: "list", autoMode: true, autoModeMaxTurns: 2, autoModeDelayMs: 0 },
    },
  );
  const { h } = room;
  const member = await invitePerson(h);
  using presence = new DisposableStack();
  const hostOnline = new AbortController();
  presence.defer(() => hostOnline.abort());
  h.root.app.presence.connect(h.owner.userId, hostOnline.signal);
  const memberBefore = await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, member.userId));
  // Observe the real composed collaborator; the default spy calls the actual operation unchanged.
  const completed = vi.spyOn(h.root.app.rpgChatOps, "onTurnCompleted");
  try {
    const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "go" });
    await h.root.settleBackground();
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages.find((m) => m.role === "user")?.authorUserId).toBe(member.userId);
    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(4);
    expect(completed.mock.calls).toHaveLength(4);
    expect(completed.mock.calls.map((call) => call[4].triggeredBy)).toEqual(Array.from({ length: 4 }, () => member.userId));
    const physical = room.peer.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions");
    expect(await speakerInputs(physical, B_CHAT_MODEL)).toHaveLength(4);
    expect(physical.map((r) => r.headers.get("authorization"))).toEqual(Array.from({ length: 4 }, () => `Bearer ${B_HOST_KEY}`));
    const canon = (await captureTurnRows(h.root.db, outcome)).filter(({ slot }) => slot.role === "assistant");
    expect(canon).toHaveLength(4);
    expect(canon.map(({ variant }) => ({ connectionId: variant.connectionId, tokensIn: variant.tokensIn, tokensOut: variant.tokensOut }))).toEqual(
      Array.from({ length: 4 }, () => ({ connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 })),
    );
    expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toEqual([]);
    expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get()).toMatchObject({
      userTurns: 1,
      assistantTurns: 4,
      tokensIn: 16,
      tokensOut: 8,
    });
    expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, member.userId))).toEqual(memberBefore);
  } finally {
    completed.mockRestore();
  }
});

test("real two-party host handoff transfers subsequent native route and liability", async () => {
  await using room = await speakerRoom(
    { chat: ["The original host funds this.", "The new host funds this."] },
    {
      characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: "The traveller aria." })],
      group: { output: "per-speaker", policy: "list" },
    },
  );
  const { h } = room;
  const nextHost = await invitePerson(h);
  const nextKey = "owned-speaker-next-host-key";
  const nextConnection = await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: nextHost, key: nextKey });
  using presence = new DisposableStack();
  for (const person of [h.owner, nextHost]) {
    const online = new AbortController();
    presence.defer(() => online.abort());
    h.root.app.presence.connect(person.userId, online.signal);
  }
  const before = await h.root.services.chat.send({ principal: nextHost, chatId: h.chatId, content: "before" });
  expect(before.aborted).toBe(false);
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: nextHost.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await h.root.services.chat.acceptHostHandoff({ principal: nextHost, chatId: h.chatId });
  const after = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "after" });
  expect(after.aborted).toBe(false);
  expect(before.messages.find((m) => m.role === "user")?.authorUserId).toBe(nextHost.userId);
  expect(after.messages.find((m) => m.role === "user")?.authorUserId).toBe(h.owner.userId);
  const physical = room.peer.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions");
  expect(await speakerInputs(physical, B_CHAT_MODEL)).toHaveLength(2);
  expect(physical.map((r) => r.headers.get("authorization"))).toEqual([`Bearer ${B_HOST_KEY}`, `Bearer ${nextKey}`]);
  const beforeCanon = (await captureTurnRows(h.root.db, before)).filter(({ slot }) => slot.role === "assistant");
  const afterCanon = (await captureTurnRows(h.root.db, after)).filter(({ slot }) => slot.role === "assistant");
  expect(beforeCanon.map(({ variant }) => ({ connectionId: variant.connectionId, tokensIn: variant.tokensIn, tokensOut: variant.tokensOut }))).toEqual([
    { connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(afterCanon.map(({ variant }) => ({ connectionId: variant.connectionId, tokensIn: variant.tokensIn, tokensOut: variant.tokensOut }))).toEqual([
    { connectionId: nextConnection.id, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toEqual([]);
  const actualSeats = await h.root.services.chat.listParticipants({ principal: nextHost, chatId: h.chatId });
  expect(actualSeats.some((s) => s.characterId === after.messages.find((m) => m.role === "assistant")?.characterId && s.leftSeq === null)).toBe(true);
});

test("a valid member binding cannot replace the absent host binding or commit a user row", async () => {
  await using room = await speakerRoom({ chat: ["Only the member's own room may use this key."] }, { group: { output: "per-speaker", policy: "list" } });
  const { h } = room;
  const member = await invitePerson(h);
  const memberKey = "owned-speaker-member-key";
  const ownConnection = await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: member, key: memberKey });
  expect(
    (await h.root.services.connection.listBindings({ principal: member })).some((b) => b.task === "chat" && b.binding?.connectionId === ownConnection.id),
  ).toBe(true);
  await h.root.services.connection.remove({ principal: h.owner, connectionId: room.connection.id });
  using presence = new DisposableStack();
  const hostOnline = new AbortController();
  presence.defer(() => hostOnline.abort());
  h.root.app.presence.connect(h.owner.userId, hostOnline.signal);
  await expect(h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "hi" })).rejects.toBeInstanceOf(NoConnectionError);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
  expect(room.peer.requests.some((r) => r.method === "POST" && r.headers.get("authorization") === `Bearer ${memberKey}`)).toBe(false);
});
