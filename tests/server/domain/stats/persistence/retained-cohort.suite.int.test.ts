// @subject packages/server/src/domain/stats/persistence/owner-chat-scope.ts
// @subject packages/server/src/domain/stats/persistence/retained-chat-accounting.ts
// @subject packages/server/src/domain/stats/persistence/messages-economics.ts
// @subject packages/server/src/domain/chat/persistence/retained-canon.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import {
  characterStats,
  characters,
  chatGenerationObservations,
  chatParticipants,
  chats,
  closeDb,
  messages,
  messageVariants,
  ownerStats,
  statsCanonVersions,
} from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterHandle, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors, seedRecallRoom } from "@orb/testkit/node/corpus-seed.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };

function paidReplies(count = 1): ReturnType<typeof createCorpusProviderExecution> {
  let remaining = count;
  return createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: "",
    completion: () => {
      if (remaining-- <= 0) {
        throw new Error("the retained accounting physical reply script is exhausted");
      }
      return { text: "The paid ledger survived the accepted copy.", toolCalls: [], usage: { promptTokens: 100, completionTokens: 35 } };
    },
  });
}

async function card(root: ServerTestHarness, principal: Principal, handle: CharacterHandle): ReturnType<ServerTestHarness["services"]["character"]["create"]> {
  return await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ name: handle, handle, description: `Private ${handle} library` }),
  });
}

async function invite(root: ServerTestHarness, host: Principal, member: Principal, chatId: ChatId): Promise<void> {
  const invitation = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
}

async function accounting(root: ServerTestHarness): Promise<{
  readonly owners: readonly (typeof ownerStats.$inferSelect)[];
  readonly voices: readonly (typeof characterStats.$inferSelect)[];
  readonly versions: readonly (typeof statsCanonVersions.$inferSelect)[];
}> {
  return {
    owners: await root.db.select().from(ownerStats).orderBy(ownerStats.ownerId),
    voices: await root.db.select().from(characterStats).orderBy(characterStats.characterId),
    versions: await root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId),
  };
}

for (const change of ["seat", "canon", "copy-plan"] as const) {
  test(`a prepared native copy handoff refuses stale ${change} tuples before any accounting or room swap`, async () => {
    const held = await freshHeldDb();
    await using ownership = new AsyncDisposableStack();
    ownership.defer(() => closeDb(held.db));
    const root = ownership.use(await createServerHarness({ db: held.db }));
    const host = await root.principalFor(root.ownerId);
    const nominee = await root.principalFor((await root.actor()).id);
    const other = await root.principalFor((await root.actor()).id);
    const source = await card(root, host, castId<CharacterHandle>("offered-ledger"));
    const room = await root.services.chat.startChat({ principal: host, characterIds: [source.id], opening: "none" });
    const post = await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The original canon witness.");
    await invite(root, host, nominee, room.chat.id);
    await invite(root, host, other, room.chat.id);
    await root.services.chat.nominateHostHandoff({
      principal: host,
      chatId: room.chat.id,
      userId: nominee.userId,
      offer: { copyCharacters: true, copyGmPreset: false },
    });
    const gate = held.hold(/^insert into "chats"/u);
    let pending: Promise<void> | undefined;
    try {
      const accept = root.services.chat.acceptHostHandoff({ principal: nominee, chatId: room.chat.id });
      pending = accept.catch(() => undefined);
      await gate.reached;
      gate.disarm();
      if (change === "seat") {
        await root.services.chat.removeCharacterFromChat({ principal: host, chatId: room.chat.id, characterId: source.id });
      } else if (change === "canon") {
        await root.services.chat.editMessage({ principal: host, chatId: room.chat.id, messageId: post.messageId, content: "The current canon witness." });
      } else {
        await root.services.chat.nominateHostHandoff({ principal: host, chatId: room.chat.id, userId: other.userId });
      }
      const expectedAccounting = await accounting(root);
      const expectedRoom = await root.db.select().from(chats).where(eq(chats.id, room.chat.id));
      const expectedSeats = await root.db.select().from(chatParticipants).where(eq(chatParticipants.chatId, room.chat.id)).orderBy(chatParticipants.id);
      const expectedCanon = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, post.messageId));
      gate.release();
      await expect(accept).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
      expect(await accounting(root)).toEqual(expectedAccounting);
      expect(await root.db.select().from(chats).where(eq(chats.id, room.chat.id))).toEqual(expectedRoom);
      expect(await root.db.select().from(chatParticipants).where(eq(chatParticipants.chatId, room.chat.id)).orderBy(chatParticipants.id)).toEqual(
        expectedSeats,
      );
      expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, post.messageId))).toEqual(expectedCanon);
    } finally {
      gate.release();
      await pending;
    }
  });
}

test("retained owners and owner-room inverse projections include departed characters, not human visitors or husks", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const outsider = await root.principalFor((await root.actor()).id);
  const original = await card(root, host, castId<CharacterHandle>("retained-original"));
  const duplicate = await card(root, host, castId<CharacterHandle>("retained-duplicate"));
  const incoming = await card(root, member, castId<CharacterHandle>("retained-incoming"));
  const foreign = await card(root, outsider, castId<CharacterHandle>("unrelated-library"));
  const room = await root.services.chat.startChat({ principal: host, characterIds: [original.id, duplicate.id], opening: "none" });
  await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The retained witnesses counted the ledger.");
  await invite(root, host, member, room.chat.id);
  await invite(root, host, outsider, room.chat.id);
  await root.services.chat.nominateHostHandoff({ principal: host, chatId: room.chat.id, userId: member.userId });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId: room.chat.id });
  await root.services.chat.addCharacterToChat({ principal: member, chatId: room.chat.id, characterId: incoming.id });
  const husk = await root.services.chat.startChat({ principal: host, characterIds: [original.id], opening: "none" });
  const other = await root.services.chat.startChat({ principal: outsider, characterIds: [foreign.id], opening: "none" });
  await root.app.chatRpgOps.postNarratorMessage(other.chat.id, "Only the unrelated owner retains this room.");
  const beforeShared = await root.db.select().from(ownerStats).orderBy(ownerStats.ownerId);
  await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "Both retained owners receive this signed canon contribution.");
  const afterShared = await root.db.select().from(ownerStats).orderBy(ownerStats.ownerId);
  expect(
    afterShared
      .map((row) => [row.ownerId, row.assistantTurns - (beforeShared.find((before) => before.ownerId === row.ownerId)?.assistantTurns ?? 0)])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  ).toEqual(
    [
      [host.userId, 1],
      [member.userId, 1],
      [outsider.userId, 0],
    ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
  expect(await root.db.select().from(chats).where(eq(chats.id, husk.chat.id))).toMatchObject([{ startedAt: null }]);
  const retainedSeats = await root.db.select().from(chatParticipants).where(eq(chatParticipants.chatId, room.chat.id));
  expect(retainedSeats.filter((seat) => seat.characterId === original.id || seat.characterId === duplicate.id).every((seat) => seat.leftSeq !== null)).toBe(
    true,
  );
  for (const ownerId of [host.userId, member.userId, outsider.userId]) {
    await root.services.stats.reconcile(ownerId);
    expect(await root.services.stats.overview(ownerId)).toMatchObject({ chats: 1, assistantTurns: ownerId === outsider.userId ? 1 : 2 });
  }
  await expect(root.services.character.get({ principal: outsider, characterId: original.id })).rejects.toBeInstanceOf(DomainNotFoundError);
});

test("an accepted native copy handoff rebases exact retained cohorts and signed variant economics without changing variant identity", async () => {
  const wire = paidReplies();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const actors = await seedCorpusActors(root);
  const nominee = await root.principalFor(actors.secondUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const turn = await root.services.chat.send({ principal: actors.owner, chatId, content: "Record the paid ledger.", intent: INTENT });
  expect(turn.aborted).toBe(false);
  await root.settleBackground();
  const assistant = turn.messages.find((row) => row.role === "assistant");
  if (assistant?.characterId === null || assistant?.characterId === undefined) {
    throw new Error("the native paid reply has no actual character voice");
  }
  const beforeVariants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, assistant.id));
  expect(await root.services.stats.overview(actors.owner.userId)).toMatchObject({ chats: 1, assistantTurns: 1, tokensIn: 100, tokensOut: 35 });
  await invite(root, actors.owner, nominee, chatId);
  await root.services.chat.nominateHostHandoff({
    principal: actors.owner,
    chatId,
    userId: nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });
  const [slot] = await root.db.select().from(messages).where(eq(messages.id, assistant.id));
  if (slot?.characterId === null || slot?.characterId === undefined) {
    throw new Error("the accepted copy left no native voice identity");
  }
  expect(slot.characterId).not.toBe(assistant.characterId);
  expect(slot.selectedVariantId).toBe(assistant.selectedVariantId);
  expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, assistant.id))).toEqual(beforeVariants);
  expect(await root.db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, slot.characterId))).toEqual([
    { ownerId: nominee.userId },
  ]);
  const incoming = await root.services.stats.overview(nominee.userId);
  const outgoing = await root.services.stats.overview(actors.owner.userId);
  expect(incoming).toMatchObject({ chats: 1, assistantTurns: 1, tokensIn: 100, tokensOut: 35 });
  expect(outgoing).toMatchObject({
    chats: 0,
    assistantTurns: 0,
    tokensIn: null,
    tokensOut: null,
    tokensInProvenance: "unrecorded",
    tokensOutProvenance: "unrecorded",
  });
  expect(await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, actors.owner.userId))).toMatchObject([
    { tokensIn: 0, tokensOut: 0, tokensInMeasuredSamples: 0, tokensOutMeasuredSamples: 0 },
  ]);
  expect(await root.services.stats.characterEconomics(actors.owner.userId)).toEqual([]);
  expect(await root.services.stats.characterEconomics(nominee.userId)).toMatchObject([
    { characterId: slot.characterId, generations: 1, tokensIn: 100, tokensOut: 35 },
  ]);
  for (const ownerId of [actors.owner.userId, nominee.userId]) {
    const before = await root.services.stats.overview(ownerId);
    await root.services.stats.reconcile(ownerId);
    expect(await root.services.stats.overview(ownerId)).toMatchObject({
      chats: before?.chats,
      assistantTurns: before?.assistantTurns,
      tokensIn: before?.tokensIn,
      tokensOut: before?.tokensOut,
    });
  }
});

test("a stale voice owner refuses canon even when accepted copying preserves the exact retained owner cohort", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const wire = paidReplies();
  const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
  const actors = await seedCorpusActors(root);
  const nominee = await root.principalFor(actors.secondUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const turn = await root.services.chat.send({ principal: actors.owner, chatId, content: "Retain the voice.", intent: INTENT });
  expect(turn.aborted).toBe(false);
  await root.settleBackground();
  const source = turn.messages.find((message) => message.role === "assistant");
  if (source?.characterId === null || source?.characterId === undefined) {
    throw new Error("the retained voice control has no native seated speaker");
  }
  const retainedA = await card(root, actors.owner, castId<CharacterHandle>("departed-a"));
  await root.services.chat.addCharacterToChat({ principal: actors.owner, chatId, characterId: retainedA.id });
  await root.services.chat.removeCharacterFromChat({ principal: actors.owner, chatId, characterId: retainedA.id });
  await invite(root, actors.owner, nominee, chatId);
  await root.services.chat.nominateHostHandoff({ principal: actors.owner, chatId, userId: nominee.userId });
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });
  const retainedB = await card(root, nominee, castId<CharacterHandle>("departed-b"));
  await root.services.chat.addCharacterToChat({ principal: nominee, chatId, characterId: retainedB.id });
  await root.services.chat.removeCharacterFromChat({ principal: nominee, chatId, characterId: retainedB.id });
  await root.services.chat.nominateHostHandoff({ principal: nominee, chatId, userId: actors.owner.userId });
  await root.services.chat.acceptHostHandoff({ principal: actors.owner, chatId });
  await root.services.chat.addCharacterToChat({ principal: actors.owner, chatId, characterId: source.characterId });
  await root.services.stats.reconcile(actors.owner.userId);
  await root.services.stats.reconcile(nominee.userId);
  for (const ownerId of [actors.owner.userId, nominee.userId]) {
    expect(await root.services.stats.overview(ownerId)).toMatchObject({ chats: 1, assistantTurns: 1, tokensIn: 100, tokensOut: 35 });
  }
  await root.services.chat.nominateHostHandoff({
    principal: actors.owner,
    chatId,
    userId: nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  const gate = held.hold(/^insert into "chats"/u);
  let pending: Promise<void> | undefined;
  try {
    const edit = root.services.chat.editMessage({ principal: actors.owner, chatId, messageId: source.id, content: "This stale voice must not change canon." });
    pending = edit.then(
      () => undefined,
      () => undefined,
    );
    await gate.reached;
    gate.disarm();
    await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });
    const [copied] = await root.db.select().from(messages).where(eq(messages.id, source.id));
    expect(copied?.characterId).not.toBe(source.characterId);
    for (const ownerId of [actors.owner.userId, nominee.userId]) {
      expect(await root.services.stats.overview(ownerId)).toMatchObject({ chats: 1, assistantTurns: 1, tokensIn: 100, tokensOut: 35 });
    }
    const expected = await accounting(root);
    const variants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id));
    gate.release();
    await expect(edit).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
    expect(await accounting(root)).toEqual(expected);
    expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id))).toEqual(variants);
    await root.services.chat.editMessage({ principal: nominee, chatId, messageId: source.id, content: "The current voice can edit canon." });
    expect((await root.services.chat.listMessages({ principal: nominee, chatId })).messages.find((message) => message.id === source.id)?.content).toBe(
      "The current voice can edit canon.",
    );
  } finally {
    gate.release();
    await pending;
  }
});

for (const change of ["none", "source-variant"] as const) {
  test(`native continuation transfers paid facts only through retained generation first-write guards: ${change}`, async () => {
    const held = await freshHeldDb();
    await using ownership = new AsyncDisposableStack();
    ownership.defer(() => closeDb(held.db));
    const wire = paidReplies(2);
    const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
    const actors = await seedCorpusActors(root);
    const nominee = await root.principalFor(actors.secondUserId);
    const caller = await root.internalCallerFor(root.ownerId);
    const chatId = await seedRecallRoom(caller);
    await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
    const turn = await root.services.chat.send({ principal: actors.owner, chatId, content: "Preserve the paid source.", intent: INTENT });
    expect(turn.aborted).toBe(false);
    await root.settleBackground();
    const source = turn.messages.find((message) => message.role === "assistant");
    if (source === undefined) {
      throw new Error("the retained generation control has no native assistant source");
    }
    await invite(root, actors.owner, nominee, chatId);
    await root.services.chat.nominateHostHandoff({
      principal: actors.owner,
      chatId,
      userId: nominee.userId,
      offer: { copyCharacters: true, copyGmPreset: false },
    });
    const gate = held.hold(/^insert into "chats"/u);
    let pending: Promise<void> | undefined;
    try {
      const continuation = root.services.chat.continueTurn({ principal: actors.owner, chatId, messageId: source.id, intent: INTENT });
      pending = continuation.then(
        () => undefined,
        () => undefined,
      );
      await gate.reached;
      gate.disarm();
      expect(await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toMatchObject([
        { sourceMessageId: source.id, sourceVariantId: source.selectedVariantId, tokensIn: 100, tokensOut: 35 },
      ]);
      if (change === "source-variant") {
        await root.services.chat.deleteMessages({ principal: actors.owner, chatId, messageIds: [source.id] });
      }
      const expectedAccounting = await accounting(root);
      const expectedVariants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id));
      const expectedFacts = await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId));
      gate.release();
      const outcome = await continuation;
      expect(outcome).toMatchObject(change === "none" ? { aborted: false } : { aborted: true, abortReason: "stale" });
      expect(await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toEqual(
        change === "none" ? [] : expectedFacts,
      );
      const variants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id));
      expect(change === "none" ? variants.map(({ id, messageId, tokensIn, tokensOut }) => ({ id, messageId, tokensIn, tokensOut })) : variants).toEqual(
        change === "none" ? [{ id: source.selectedVariantId, messageId: source.id, tokensIn: 100, tokensOut: 35 }] : expectedVariants,
      );
      const overview = await root.services.stats.overview(actors.owner.userId);
      expect(
        change === "none" ? { assistantTurns: overview?.assistantTurns, tokensIn: overview?.tokensIn, tokensOut: overview?.tokensOut } : await accounting(root),
      ).toEqual(change === "none" ? { assistantTurns: 1, tokensIn: 100, tokensOut: 35 } : expectedAccounting);
    } finally {
      gate.release();
      await pending;
    }
  });
}

test("native continuation settles before handoff rebases its retained cohort and signed economics", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const wire = paidReplies(2);
  const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
  const actors = await seedCorpusActors(root);
  const nominee = await root.principalFor(actors.secondUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const turn = await root.services.chat.send({ principal: actors.owner, chatId, content: "Preserve the paid source.", intent: INTENT });
  expect(turn.aborted).toBe(false);
  await root.settleBackground();
  const source = turn.messages.find((message) => message.role === "assistant");
  if (source === undefined) {
    throw new Error("the retained generation control has no native assistant source");
  }
  await invite(root, actors.owner, nominee, chatId);
  await root.services.chat.nominateHostHandoff({
    principal: actors.owner,
    chatId,
    userId: nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  const gate = held.hold(/^insert into "chats"/u);
  let pending: Promise<void> | undefined;
  let handoffs = Promise.resolve<PromiseSettledResult<void>[]>([]);
  try {
    const continuation = root.services.chat.continueTurn({ principal: actors.owner, chatId, messageId: source.id, intent: INTENT });
    pending = continuation.then(
      () => undefined,
      () => undefined,
    );
    await gate.reached;
    gate.disarm();
    expect(await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toMatchObject([
      { sourceMessageId: source.id, sourceVariantId: source.selectedVariantId, tokensIn: 100, tokensOut: 35 },
    ]);
    const beforeVariants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id));
    const beforeCards = await root.db.select().from(characters).where(eq(characters.ownerId, nominee.userId)).orderBy(characters.id);
    let settledHandoffs = 0;
    const acceptances = [0, 1].map(() =>
      Promise.allSettled([root.services.chat.acceptHostHandoff({ principal: nominee, chatId })]).then(([result]) => {
        settledHandoffs += 1;
        return result;
      }),
    );
    handoffs = Promise.all(acceptances);
    // The competing refusal proves the real transition closed admission without a timing guess.
    expect(await Promise.race(acceptances)).toMatchObject({ status: "rejected", reason: { code: CHAT_OP_CODES.locked } });
    expect(settledHandoffs).toBe(1);
    expect(await root.db.select().from(characters).where(eq(characters.ownerId, nominee.userId)).orderBy(characters.id)).toEqual(beforeCards);
    expect(await root.db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId))).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "host", userId: actors.owner.userId, leftSeq: null })]),
    );
    expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id))).toEqual(beforeVariants);
    expect(await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toMatchObject([
      { sourceMessageId: source.id, sourceVariantId: source.selectedVariantId, tokensIn: 100, tokensOut: 35 },
    ]);
    gate.release();
    const [outcome, accepted] = await Promise.all([continuation, handoffs]);
    expect(outcome).toMatchObject({
      aborted: false,
      messages: [{ id: source.id, selectedVariantId: source.selectedVariantId, content: source.content.repeat(2) }],
    });
    expect(accepted).toEqual(
      expect.arrayContaining([
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: expect.objectContaining({ code: CHAT_OP_CODES.locked }) },
      ]),
    );
    expect(await root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toEqual([]);
    expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id))).toMatchObject([
      { id: source.selectedVariantId, messageId: source.id, content: source.content.repeat(2), tokensIn: 100, tokensOut: 35 },
    ]);
    const [copied] = await root.db.select().from(messages).where(eq(messages.id, source.id));
    if (copied?.characterId === null || copied?.characterId === undefined) {
      throw new Error("the settled handoff has no copied voice");
    }
    expect(copied.characterId).not.toBe(source.characterId);
    expect(copied.selectedVariantId).toBe(source.selectedVariantId);
    expect(await root.db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, copied.characterId))).toEqual([
      { ownerId: nominee.userId },
    ]);
    expect(await root.services.stats.overview(actors.owner.userId)).toMatchObject({ chats: 0, assistantTurns: 0, tokensIn: null, tokensOut: null });
    expect(await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, actors.owner.userId))).toMatchObject([
      { tokensIn: 0, tokensOut: 0, tokensInMeasuredSamples: 0, tokensOutMeasuredSamples: 0 },
    ]);
    expect(await root.services.stats.overview(nominee.userId)).toMatchObject({ chats: 1, assistantTurns: 1, tokensIn: 100, tokensOut: 35 });
    expect(await root.services.stats.characterEconomics(actors.owner.userId)).toEqual([]);
    expect(await root.services.stats.characterEconomics(nominee.userId)).toMatchObject([
      { characterId: copied.characterId, generations: 1, tokensIn: 100, tokensOut: 35 },
    ]);
    for (const ownerId of [actors.owner.userId, nominee.userId]) {
      const before = await root.services.stats.overview(ownerId);
      await root.services.stats.reconcile(ownerId);
      expect(await root.services.stats.overview(ownerId)).toMatchObject({
        chats: before?.chats,
        assistantTurns: before?.assistantTurns,
        tokensIn: before?.tokensIn,
        tokensOut: before?.tokensOut,
      });
    }
  } finally {
    gate.release();
    await pending;
    await handoffs;
  }
});
