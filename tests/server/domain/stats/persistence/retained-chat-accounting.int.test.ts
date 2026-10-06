import { characterStats, characters, chatParticipants, chats, messageVariants, ownerStats } from "@orb/db";
import { castId } from "@orb/kit/ids";
import { createResolveRetainedChatAccountingScope, reconcileStats } from "@orb/server/domain/stats";
import { eq, sql } from "drizzle-orm";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../chat/_support.ts";

test("multi-owner retained canon rebuild writes only its owned character grain and preserves both owner totals", async ({ db }) => {
  const a = await seedUser(db, castId("cohort_a"));
  const b = await seedUser(db, castId("cohort_b"));
  const chatId = await seedChat(db, "cohort");
  const voice = await seedCharacter(db, a, "cohort_voice");
  const other = await seedCharacter(db, b, "cohort_other");
  await seedParticipant(db, { chatId, key: "cohort_voice", characterId: voice, role: "member", joinSeq: 0 });
  await seedParticipant(db, { chatId, key: "cohort_other", characterId: other, role: "member", joinSeq: 1 });
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant", characterId: voice, content: "Retained reply." });
  await db.update(messageVariants).set({ costUsd: 0.25, tokensIn: 10, tokensOut: 20, tokenProvenance: "measured" }).where(eq(messageVariants.id, variantId));
  await reconcileStats(db, { ownerId: a, now: () => FROZEN_AT });
  await expect(reconcileStats(db, { ownerId: b, now: () => FROZEN_AT })).resolves.toMatchObject({ owners: 1, characters: 1 });
  for (const ownerId of [a, b]) {
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toMatchObject({
      costUsd: 0.25,
      tokensIn: 10,
      tokensOut: 20,
      assistantTurns: 1,
    });
  }
  expect((await db.select().from(characterStats).where(eq(characterStats.characterId, voice)))[0]).toMatchObject({
    costUsd: 0.25,
    tokensIn: 10,
    tokensOut: 20,
    assistantTurns: 1,
  });
  expect((await db.select().from(characterStats).where(eq(characterStats.characterId, other)))[0]).toMatchObject({
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    assistantTurns: 0,
  });
  await reconcileStats(db, { ownerId: a, now: () => FROZEN_AT });
  expect(await db.select().from(characterStats)).toHaveLength(2);
});

test("canonical scope deduplicates departed seats, fences equal-cardinality replacement and pins the actual voice owner", async ({ db }) => {
  const a = await seedUser(db, castId("scope_a"));
  const b = await seedUser(db, castId("scope_b"));
  const chatId = await seedChat(db, "scope");
  const voice = await seedCharacter(db, a, "scope_voice");
  const duplicate = await seedCharacter(db, a, "scope_duplicate");
  await seedParticipant(db, { chatId, key: "scope_voice", characterId: voice, role: "member", leftSeq: 3 });
  const seat = await seedParticipant(db, { chatId, key: "scope_duplicate", characterId: duplicate, role: "member" });
  const resolve = createResolveRetainedChatAccountingScope(db);
  const snapshot = await resolve(chatId, voice);
  expect(snapshot.ownerIds).toEqual([a]);
  expect(snapshot.characterOwnerId).toBe(a);
  expect(await db.all(sql`select 1 where ${snapshot.predicate}`)).toHaveLength(1);
  await db.update(characters).set({ ownerId: b }).where(eq(characters.id, duplicate));
  expect(await db.all(sql`select 1 where ${snapshot.predicate}`)).toEqual([]);
  await db.delete(chatParticipants).where(eq(chatParticipants.id, seat));
  expect(await db.all(sql`select 1 where ${snapshot.predicate}`)).toHaveLength(1);
  await db.update(characters).set({ ownerId: b }).where(eq(characters.id, voice));
  const replacement = await resolve(chatId, voice);
  expect(replacement.ownerIds).toEqual([b]);
  expect(await db.all(sql`select 1 where ${snapshot.predicate}`)).toEqual([]);
  expect(await db.all(sql`select 1 where ${replacement.predicate}`)).toHaveLength(1);
  await db.update(chats).set({ startedAt: null }).where(eq(chats.id, chatId));
  expect(await db.all(sql`select 1 where ${replacement.predicate}`)).toEqual([]);
  expect((await resolve(chatId, voice)).ownerIds).toEqual([]);
});

test("voice owner changes refuse even when the retained owner cohort is unchanged", async ({ db }) => {
  const a = await seedUser(db, castId("voice_a"));
  const b = await seedUser(db, castId("voice_b"));
  const chatId = await seedChat(db, "voice");
  const voice = await seedCharacter(db, a, "voice_actor");
  const retainedA = await seedCharacter(db, a, "voice_retained_a");
  const retainedB = await seedCharacter(db, b, "voice_retained_b");
  for (const [key, characterId] of [
    ["voice_actor", voice],
    ["voice_a", retainedA],
    ["voice_b", retainedB],
  ] as const) {
    await seedParticipant(db, { chatId, key, characterId });
  }
  const resolve = createResolveRetainedChatAccountingScope(db);
  const snapshot = await resolve(chatId, voice);
  expect(snapshot.ownerIds).toEqual([a, b]);
  await db.update(characters).set({ ownerId: b }).where(eq(characters.id, voice));
  expect((await resolve(chatId, voice)).ownerIds).toEqual(snapshot.ownerIds);
  expect(await db.all(sql`select 1 where ${snapshot.predicate}`)).toEqual([]);
});
