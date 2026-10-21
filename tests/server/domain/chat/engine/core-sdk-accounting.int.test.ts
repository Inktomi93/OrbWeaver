// @subject packages/server/src/domain/chat/persistence/generation-observation.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { characters, chatGenerationObservations, closeDb, messages, messageVariants, ownerStats } from "@orb/db";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { captureSdkSessionRows } from "@orb/testkit/node/factories/connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { coreSdkRoom } from "./core-sdk-fixture.ts";

test("a failed actual SDK terminal result retains paid facts without committing its reply", async () => {
  await using fixture = await coreSdkRoom({ text: "API Error: 400 controlled core refusal", failed: true, cost: 0.25 });
  const { h } = fixture;
  const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const priorStats = await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get();
  if (priorStats === undefined) {
    throw new Error("the reconciled real SDK seed has no owner statistics");
  }
  await expect(h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).rejects.toMatchObject({ kind: "invalid", retryable: false });
  expect(fixture.receipts).toEqual([{ text: "API Error: 400 controlled core refusal", failed: true, cost: 0.25 }]);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
  expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toMatchObject([
    {
      chatId: h.chatId,
      funderUserId: h.owner.userId,
      connectionId: fixture.connection.id,
      wire: "agent-sdk",
      costUsd: 0.25,
      costProvenance: "estimated",
      tokensIn: 15,
      tokensOut: 20,
      modelCalls: 3,
      terminalReason: "api_error",
    },
  ]);
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get()).toMatchObject({
    assistantTurns: priorStats.assistantTurns,
    costUsd: priorStats.costUsd + 0.25,
    tokensIn: priorStats.tokensIn + 15,
    tokensOut: priorStats.tokensOut + 20,
  });
  await fixture[Symbol.asyncDispose]();
  const physical = fixture.childCounts();
  expect(physical.spawned).toBeGreaterThan(0);
  expect(physical.closed).toBe(physical.spawned);
});

test.for(["cohort", "voice"] as const)("an actual paid SDK commit refuses stale retained %s without redirecting the paid facts", async (race) => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const fixture = ownership.use(await coreSdkRoom({ text: "A completed paid reply.", failed: false, cost: 0.125 }, { db: held.db }));
  const { h } = fixture;
  const a = await h.root.actor();
  const c = await h.root.actor();
  const voice = h.characters[0];
  if (voice === undefined) {
    throw new Error("the real paid scope fixture has no active voice");
  }
  const old = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "retained-old", name: "Old", description: "A departed voice." }),
  });
  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: old.id });
  await h.caller.chat.removeCharacterFromChat({ chatId: h.chatId, characterId: old.id });
  await h.root.db.update(characters).set({ ownerId: a.id }).where(eq(characters.id, old.id));
  if (race === "voice") {
    const otherB = await h.caller.character.create({
      input: createCharacterSchema.parse({ handle: "retained-b", name: "B", description: "An independent retained B voice." }),
    });
    const otherC = await h.caller.character.create({
      input: createCharacterSchema.parse({ handle: "retained-c", name: "C", description: "An independent retained C voice." }),
    });
    for (const character of [otherB, otherC]) {
      await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: character.id });
      await h.caller.chat.removeCharacterFromChat({ chatId: h.chatId, characterId: character.id });
    }
    await h.root.db.update(characters).set({ ownerId: c.id }).where(eq(characters.id, otherC.id));
  }
  for (const ownerId of [a.id, h.owner.userId, c.id]) {
    await h.root.services.stats.reconcile(ownerId);
  }
  const beforeCanon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const boundary = held.hold(/^insert into "messages"/u);
  const running = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: voice.id });
  const settled = Promise.allSettled([running]);
  try {
    await Promise.race([
      boundary.reached,
      running.then(() => {
        throw new Error("the real paid SDK turn settled without reaching its held canon write");
      }),
    ]);
    expect(fixture.receipts).toEqual([{ text: "A completed paid reply.", failed: false, cost: 0.125 }]);
    const beforeStats = await h.root.db.select().from(ownerStats).orderBy(ownerStats.ownerId);
    expect(beforeStats.find((row) => row.ownerId === h.owner.userId)).toMatchObject({ costUsd: 0.125, tokensIn: 15, tokensOut: 20 });
    await h.root.db
      .update(characters)
      .set({ ownerId: c.id })
      .where(eq(characters.id, race === "cohort" ? old.id : voice.id));
    boundary.release();
    expect(await running).toMatchObject({ aborted: true, abortReason: "stale", messages: [] });
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(beforeCanon);
    expect(await h.root.db.select().from(ownerStats).orderBy(ownerStats.ownerId)).toEqual(beforeStats);
    expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toMatchObject([
      { funderUserId: h.owner.userId, connectionId: fixture.connection.id, costUsd: 0.125, tokensIn: 15, tokensOut: 20 },
    ]);
  } finally {
    boundary.release();
    await settled;
  }
  await fixture[Symbol.asyncDispose]();
  const physical = fixture.childCounts();
  expect(physical.spawned).toBeGreaterThan(0);
  expect(physical.closed).toBe(physical.spawned);
});

test("actual SDK continuation replaces operation economics while retaining the native session's paid total", async () => {
  await using fixture = await coreSdkRoom({ text: "A retained reply.", failed: false, cost: 0.25 });
  const { h } = fixture;
  const first = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Record the paid reply before its continuation." });
  expect(first.aborted).toBe(false);
  const target = first.messages.find((message) => message.role === "assistant");
  if (target === undefined || target.selectedVariantId === null) {
    throw new Error("the real native SDK committed no selected reply");
  }
  const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
  expect(parseVariantMetadata(before?.metadata).usageLegs).toMatchObject([{ costUsd: 0.25, wire: "agent-sdk", tokensIn: 15, tokensOut: 20, modelCalls: 3 }]);
  const firstSession = await captureSdkSessionRows(h.root.db, h.chatId, fixture.connection.id);
  expect(firstSession).toHaveLength(1);
  await fixture.setReply({ text: " Continued.", failed: false, cost: 0.375 });
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  expect(continued.aborted).toBe(false);
  expect(fixture.imports).toHaveLength(2);
  expect(fixture.imports[1]).toMatchObject({ sessionId: firstSession[0]?.sdkSessionId, resume: firstSession[0]?.sdkSessionId });
  expect(fixture.imports[1]?.frames).toContainEqual(
    expect.objectContaining({
      type: "cost-state",
      sessionId: firstSession[0]?.sdkSessionId,
      modelUsage: expect.objectContaining({ [fixture.connection.model]: expect.objectContaining({ costUSD: 0.25 }) }),
    }),
  );
  expect(continued.messages).toMatchObject([{ id: target.id, content: "A retained reply.Continued." }]);
  expect(fixture.receipts).toEqual([
    { text: "A retained reply.", failed: false, cost: 0.25 },
    { text: " Continued.", failed: false, cost: 0.375 },
  ]);
  const after = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
  expect(parseVariantMetadata(after?.metadata).usageLegs).toMatchObject([{ costUsd: 0.125, wire: "agent-sdk", tokensIn: 15, tokensOut: 20, modelCalls: 3 }]);
  expect(parseVariantMetadata(after?.metadata).usageLegs).toHaveLength(1);
  const afterSession = await captureSdkSessionRows(h.root.db, h.chatId, fixture.connection.id);
  expect(afterSession).toHaveLength(1);
  expect(afterSession).toMatchObject([{ sdkSessionId: firstSession[0]?.sdkSessionId, isPrimary: true }]);
  expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toEqual([]);
  const live = await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get();
  expect(live).toMatchObject({ costUsd: 0.125, costSamples: 1, notionalCostSamples: 1, tokensIn: 15, tokensOut: 20 });
  await h.root.services.stats.reconcile(h.owner.userId);
  const rebuilt = await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get();
  expect(rebuilt).toMatchObject({ costUsd: 0.125, costSamples: 1, notionalCostSamples: 1, tokensIn: 15, tokensOut: 20 });
  await fixture[Symbol.asyncDispose]();
  const physical = fixture.childCounts();
  expect(physical.spawned).toBeGreaterThan(0);
  expect(physical.closed).toBe(physical.spawned);
});
