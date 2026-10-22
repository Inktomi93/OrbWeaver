// @subject packages/server/src/domain/chat/verbs/turn.ts
// Only real member sends create the rows: presence, handoff, claim, replay and inbox delivery remain composed.
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { GroupConfigInput } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { characters, chatGenerationObservations, chatParticipants, messages, messageVariants, pendingTurns } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { parseIanaTimeZone, UTC_TIME_ZONE } from "@orb/kit/time";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, isNull } from "drizzle-orm";
import { invitePerson } from "../persona-cache-physical.ts";
import { B_CHAT_MODEL, B_HOST_KEY, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

const LIST: GroupConfigInput = { output: "per-speaker", policy: "list", allowSelfResponses: true };
const ARIA = createCharacterSchema.parse({ handle: "aria", name: "aria", description: "A patient travelling knight." });
const CLOCK = {
  ...DEFAULT_PROMPT_CONFIG,
  sections: [
    { type: "literal", id: "clock", name: "clock", role: "system", content: "CLOCK {{date}} {{time}}", enabled: true } as const,
    ...DEFAULT_PROMPT_CONFIG.sections,
  ],
};

type Room = Awaited<ReturnType<typeof speakerRoom>>;

async function pending(room: Room, chatId = room.h.chatId): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await room.h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, chatId)).orderBy(pendingTurns.createdAt, pendingTurns.id);
}

async function assistants(room: Room, chatId = room.h.chatId): Promise<(typeof messages.$inferSelect)[]> {
  return await room.h.root.db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant")))
    .orderBy(messages.seq);
}

async function queue(
  room: Room,
  member: Room["h"]["owner"],
  chatId = room.h.chatId,
  options: { readonly content?: string; readonly timeZone?: string } = {},
): Promise<void> {
  const { content = "An owed reply.", timeZone } = options;
  const zone = timeZone === undefined ? undefined : parseIanaTimeZone(timeZone);
  if (zone === null) {
    throw new Error("the synthetic queue zone is not an actual IANA zone");
  }
  const outcome = await room.h.root.services.chat.send({ principal: member, chatId, content, ...(zone === undefined ? {} : { timeZone: zone }) });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.map((m) => m.role)).toEqual(["user"]);
  expect(outcome.messages[0]?.authorUserId).toBe(member.userId);
}

async function clocks(room: Room): Promise<string[]> {
  const inputs = await speakerInputs(room.peer.requests, B_CHAT_MODEL);
  return inputs.map(
    (input) =>
      /CLOCK (\S+ \S+)/u.exec(
        input.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n\n"),
      )?.[1] ?? "missing native clock",
  );
}

test("the offline host's own send runs inline and never creates a deferred row", async () => {
  await using room = await speakerRoom({ chat: ["Aria answers inline."] }, { characters: [ARIA], group: LIST });
  const { h } = room;
  expect(h.root.app.presence.read(h.owner.userId).online).toBe(false);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi", timeZone: UTC_TIME_ZONE });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(outcome.messages[1]?.characterId).toBe(h.characters[0]?.id);
  expect(await pending(room)).toEqual([]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
});

test("queued Kathmandu and New York turns retain their original clocks across travel", async () => {
  await using room = await speakerRoom(
    { chat: ["Kathmandu answer.", "New York answer."] },
    {
      characters: [ARIA],
      group: LIST,
      promptConfig: CLOCK,
      server: { clock: createFrozenClock(Date.UTC(2026, 0, 15, 20, 0)) },
    },
  );
  const member = await invitePerson(room.h);
  await queue(room, member, room.h.chatId, { content: "from Kathmandu", timeZone: "Asia/Kathmandu" });
  await queue(room, member, room.h.chatId, { content: "from New York", timeZone: "America/New_York" });
  expect((await pending(room)).map((row) => row.timeZone).toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(["America/New_York", "Asia/Kathmandu"]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
  await expect(room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).resolves.toEqual({ ran: 2, dropped: 0 });
  expect(await clocks(room)).toEqual(["2026-01-16 01:45:00", "2026-01-15 15:00:00"]);
  expect(await pending(room)).toEqual([]);
});

test("a service send without a reported zone stores null and drains on actual UTC", async () => {
  await using room = await speakerRoom(
    { chat: ["UTC answer."] },
    {
      characters: [ARIA],
      group: LIST,
      promptConfig: CLOCK,
      server: { clock: createFrozenClock(Date.UTC(2026, 0, 15, 20, 0)) },
    },
  );
  const member = await invitePerson(room.h);
  await queue(room, member);
  expect(await pending(room)).toMatchObject([{ timeZone: null }]);
  await expect(room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).resolves.toEqual({ ran: 1, dropped: 0 });
  expect(await clocks(room)).toEqual(["2026-01-15 20:00:00"]);
  expect(await pending(room)).toEqual([]);
});

test("host acceptance settles the frozen old funder before copying, then subsequent turns use the new host", async () => {
  await using room = await speakerRoom(
    { chat: ["The frozen old host funds this owed response.", "The new host funds the subsequent response."] },
    { characters: [ARIA], group: LIST },
  );
  const { h } = room;
  const member = await invitePerson(h);
  const nextHost = await invitePerson(h);
  const nextKey = "owned-deferred-next-host-key";
  const nextConnection = await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: nextHost, key: nextKey });
  await queue(room, member, h.chatId, { content: "before the host handoff", timeZone: "Asia/Kathmandu" });
  const frozen = await pending(room);
  expect(frozen).toMatchObject([{ triggeredBy: member.userId, runAsUserId: h.owner.userId, timeZone: "Asia/Kathmandu" }]);
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: nextHost.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await h.root.services.chat.acceptHostHandoff({ principal: nextHost, chatId: h.chatId });
  expect(await pending(room)).toEqual([]);
  const owed = await assistants(room);
  expect(owed).toHaveLength(1);
  const copies = await h.root.db.select().from(characters).where(eq(characters.ownerId, nextHost.userId));
  expect(copies).toHaveLength(1);
  const copied = copies[0];
  if (copied === undefined) {
    throw new Error("the accepted gift minted no actual owned card");
  }
  expect(copied.id).not.toBe(h.characters[0]?.id);
  expect(owed[0]?.characterId).toBe(copied.id);
  expect((await h.root.services.chat.listParticipants({ principal: nextHost, chatId: h.chatId })).filter((p) => p.leftSeq === null)).toEqual(
    expect.arrayContaining([expect.objectContaining({ userId: nextHost.userId }), expect.objectContaining({ characterId: copied.id })]),
  );
  expect(
    await h.root.db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq))),
  ).toEqual([{ userId: nextHost.userId }]);
  const before = await speakerInputs(room.peer.requests, B_CHAT_MODEL);
  expect(before).toHaveLength(1);
  expect(before[0]?.messages.map((m) => m.content).join("\n")).toContain(ARIA.description);
  const after = await h.root.services.chat.send({ principal: nextHost, chatId: h.chatId, content: "after acceptance", timeZone: UTC_TIME_ZONE });
  expect(after.aborted).toBe(false);
  expect(after.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([copied.id]);
  const physical = room.peer.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions");
  expect(await speakerInputs(physical, B_CHAT_MODEL)).toHaveLength(2);
  expect(physical.map((r) => r.headers.get("authorization"))).toEqual([`Bearer ${B_HOST_KEY}`, `Bearer ${nextKey}`]);
  const selected = await h.root.db
    .select({ connectionId: messageVariants.connectionId, tokensIn: messageVariants.tokensIn, tokensOut: messageVariants.tokensOut })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant")))
    .orderBy(messages.seq);
  expect(selected).toEqual([
    { connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 },
    { connectionId: nextConnection.id, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toEqual([]);
  await expect(h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 0, dropped: 0 });
});

test("boot all-reclaim consumes an actual send-created owed response", async () => {
  await using room = await speakerRoom({ chat: ["Boot delivers the owed answer."] }, { characters: [ARIA], group: LIST });
  const member = await invitePerson(room.h);
  await queue(room, member);
  expect(await pending(room)).toHaveLength(1);
  await expect(room.h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 1, dropped: 0 });
  expect(await pending(room)).toEqual([]);
  expect(await assistants(room)).toHaveLength(1);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
});

test("public host self-leave permanently drops the owed row and notifies its actual member", async () => {
  await using room = await speakerRoom({}, { characters: [ARIA], group: LIST });
  const { h } = room;
  const member = await invitePerson(h);
  await queue(room, member);
  expect(await pending(room)).toHaveLength(1);
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  await expect(h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 0, dropped: 1 });
  expect(await pending(room)).toEqual([]);
  expect(await assistants(room)).toEqual([]);
  const inbox = await h.root.services.notifications.list({ principal: member });
  expect(inbox.items.filter((item) => item.type === "deferred-turn-dropped").map((item) => item.payload)).toEqual([
    { type: "deferred-turn-dropped", recipientUserId: member.userId, chatId: h.chatId, reason: "chat-gone" },
  ]);
  expect((await h.root.services.notifications.list({ principal: h.owner })).items.filter((item) => item.type === "deferred-turn-dropped")).toEqual([]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
});

test("a physical provider fault requeues the identical frozen row without a permanent-drop notification", async () => {
  await using room = await speakerRoom({ chatFailure: true }, { characters: [ARIA], group: LIST });
  const { h } = room;
  const member = await invitePerson(h);
  await queue(room, member, h.chatId, { content: "wait for the provider", timeZone: "Asia/Kathmandu" });
  const frozen = await pending(room);
  expect(frozen).toHaveLength(1);
  await expect(h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 0, dropped: 0 });
  expect(await pending(room)).toEqual(frozen);
  expect(await assistants(room)).toEqual([]);
  expect((await h.root.services.notifications.list({ principal: member })).items.filter((item) => item.type === "deferred-turn-dropped")).toEqual([]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
});

test("concurrent boot and host drains claim four real queued chats exactly once each", async () => {
  await using room = await speakerRoom(
    { chat: ["First owed answer.", "Second owed answer.", "Third owed answer.", "Fourth owed answer."] },
    { characters: [ARIA], group: LIST },
  );
  const { h } = room;
  const member = await invitePerson(h);
  const chatIds: ChatId[] = [h.chatId];
  for (let i = 0; i < 3; i += 1) {
    const started = await h.root.services.chat.startChat({ principal: h.owner, characterIds: h.characters.map((c) => c.id), opening: "none" });
    const chatId = started.chat.id;
    await h.root.services.chat.setGroupConfig({ principal: h.owner, chatId, config: LIST });
    const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId, input: { invitedHandle: member.handle } });
    await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
    chatIds.push(chatId);
  }
  for (const chatId of chatIds) {
    await queue(room, member, chatId);
  }
  expect(await h.root.db.select().from(pendingTurns)).toHaveLength(4);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
  const [all, host] = await Promise.all([
    h.root.services.chat.drainDeferredTurns({ all: true }),
    h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId }),
  ]);
  expect(all.ran + host.ran).toBe(4);
  expect(all.dropped + host.dropped).toBe(0);
  expect(await h.root.db.select().from(pendingTurns)).toEqual([]);
  for (const chatId of chatIds) {
    expect(await assistants(room, chatId)).toHaveLength(1);
  }
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(4);
});
