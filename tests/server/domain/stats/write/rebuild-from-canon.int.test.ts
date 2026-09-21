// reconcileStats — the full streaming rebuild from canon (D26: economics on the SELECTED variant; swipes
// are the non-selected variants). Asserts the additive folds + the extrema + the daily/model split against
// a known canon graph, and that a re-run is idempotent (the atomic per-owner delete+replace, esoteric #11).

import type { Db } from "@orb/db";
import { characterStats, chatParticipants, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatParticipantId, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { utcDay } from "@orb/kit/stats-tally";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { insertCanonMessageStatements, reattributeMessagesStatement } from "../../../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { assistantTurnDelta } from "../../../../../packages/server/src/domain/chat/substrate/stats-delta.ts";
import { applyStatsDelta, bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { seedCharacter, seedChat, seedMessage, seedPersona, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;
let chatId: ChatId;
let assistantMessageId: MessageId;

function holdOwnerScan(sourceDb: Db): { heldDb: Db; entered: Promise<void>; release: () => void; snapshotCalls: () => number } {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let allCalls = 0;
  let snapshotCalls = 0;
  const heldDb = new Proxy(sourceDb, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (prop !== "all" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]): Promise<unknown> => {
        allCalls++;
        if (allCalls === 4) {
          entered.resolve();
          await release.promise;
        }
        const result: unknown = await Reflect.apply(value, target, args);
        const first = Array.isArray(result) ? result[0] : undefined;
        if (typeof first === "object" && first !== null && Object.hasOwn(first, "canonVersion")) {
          snapshotCalls++;
        }
        return result;
      };
    },
  }) as Db;
  return { heldDb, entered: entered.promise, release: () => release.resolve(), snapshotCalls: () => snapshotCalls };
}

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId, { name: "Aria" });
  const personaId = await seedPersona(db, ownerId);
  chatId = await seedChat(db, characterId, { createdAt: T0, updatedAt: T0 + 1000 });
  // A user turn (2 words, no economics).
  await seedMessage(db, {
    chatId,
    seq: 1,
    role: "user",
    personaId,
    createdAt: T0,
    variants: [{ content: "hello world" }],
  });
  // An assistant turn (3 words) — selected variant + one swipe (2 words), both model gpt/openrouter.
  assistantMessageId = await seedMessage(db, {
    chatId,
    seq: 2,
    role: "assistant",
    characterId,
    createdAt: T0,
    selectedIdx: 0,
    variants: [
      {
        content: "I am here",
        model: "gpt",
        provider: "openrouter",
        tokensIn: 10,
        tokensOut: 20,
        ttftMs: 50,
        genStartedAt: T0,
        genFinishedAt: T0 + 100,
        costUsd: 0.5,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        contextWindow: 1000,
        reasoning: "thinking",
        reasoningDuration: 40,
      },
      {
        content: "alt take",
        model: "gpt",
        provider: "openrouter",
        tokensIn: 2,
        tokensOut: 4,
        genStartedAt: T0,
        genFinishedAt: T0 + 50,
      },
    ],
  });
});

describe("reconcileStats", () => {
  // #1147 — THE CENSUS POPULATION IS SEATS, NOT AUTHORSHIP. `character_stats.chats` is defined here as
  // `COUNT(DISTINCT cp.chat_id)` per character seat, so a character that HOLDS a seat in a started room is
  // part of the population even with no canon of its own — a greet-less card, an imported cast member, a
  // member seated but never prompted. Building the rows off the message accumulator alone left those
  // characters with NO ROLLUP ROW AT ALL, which every reader renders as "never chatted".
  test("a SEATED but SILENT character gets a census row: the room counts, the economics are zero", async () => {
    const silent = await seedCharacter(db, ownerId, { id: "character_silent", name: "Bryn" });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_silent"),
      chatId,
      kind: "character",
      characterId: silent,
      role: "member",
      joinSeq: 0,
    });

    const res = await reconcileStats(db, { ownerId, now: createFrozenClock(T0 + 999).now });

    expect(res.characters).toBe(2);
    const row = (await db.select().from(characterStats).where(eq(characterStats.characterId, silent)))[0];
    expect(row).toMatchObject({ chats: 1, firstChatAt: T0, assistantTurns: 0, swipes: 0, contentBytes: 0, tokensIn: 0 });
    // The seat contributes nothing to the OWNER grain beyond the library count it already had — the room is
    // still one room, and the silent seat authored no economics.
    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner).toMatchObject({ chats: 1, characters: 2, assistantTurns: 1 });
  });

  test("rebuilds owner / character / daily / model rollups from canon", async () => {
    const clock = createFrozenClock(T0 + 999);
    const res = await reconcileStats(db, { ownerId, now: clock.now });
    expect(res).toEqual({ owners: 1, characters: 1, days: 1, models: 1, computedAt: T0 + 999 });

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.userTurns).toBe(1);
    expect(owner?.assistantTurns).toBe(1);
    expect(owner?.userWords).toBe(2);
    expect(owner?.assistantWords).toBe(3);
    expect(owner?.swipes).toBe(1);
    expect(owner?.swipeWords).toBe(2);
    expect(owner?.tokensIn).toBe(12); // 10 (selected) + 2 (swipe)
    expect(owner?.tokensOut).toBe(24); // 20 + 4
    expect(owner?.genTimeMs).toBe(150); // 100 (selected) + 50 (swipe)
    expect(owner?.genSamples).toBe(2);
    expect(owner?.variantMessages).toBe(1); // the assistant message had >1 variant
    expect(owner?.activeIdxSum).toBe(0); // selected idx 0
    expect(owner?.cacheReadTokens).toBe(5); // selected variant only (esoteric #5)
    expect(owner?.cacheWriteTokens).toBe(3);
    expect(owner?.maxContextTokens).toBe(1000);
    expect(owner?.reasoningGenerations).toBe(1);
    expect(owner?.characters).toBe(1);
    expect(owner?.chats).toBe(1);
    expect(owner?.computedAt).toBe(T0 + 999);

    const char = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    expect(char?.assistantTurns).toBe(1);
    expect(char?.assistantWords).toBe(3);
    expect(char?.swipes).toBe(1);
    expect(char?.tokensIn).toBe(12);
    expect(char?.genTimeMs).toBe(150);
    expect(char?.variantMessages).toBe(1);
    expect(char?.chats).toBe(1);

    const day = (await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)))[0];
    expect(day?.day).toBe(utcDay(T0));
    expect(day?.userTurns).toBe(1);
    expect(day?.assistantTurns).toBe(1);
    expect(day?.swipes).toBe(1);
    expect(day?.tokensIn).toBe(10); // MESSAGE stream only — the swipe's 2 tokens do NOT hit daily
    expect(day?.tokensOut).toBe(20);
    expect(day?.genTimeMs).toBe(150); // daily gets swipe gen-time (esoteric #1)
    expect(day?.chatsCreated).toBe(1);

    const model = (await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId)))[0];
    expect(model?.model).toBe("gpt");
    expect(model?.provider).toBe("openrouter");
    expect(model?.generations).toBe(2); // selected + swipe
    expect(model?.tokensIn).toBe(12);
    expect(model?.cacheReadTokens).toBe(5); // message-stream only
  });

  test("an AGENT-authored assistant row folds to the HOST owner + skips character_stats (D60, doc 02 §4)", async () => {
    // The AP2 stats twin-path: a seated agent's turn (characterId null) in a host-owned-character room is
    // scanned via ownerChatIds (the chat is in scope through its character participant), credits the HOST's
    // owner/day/model grains, and NEVER creates a character_stats row (foldMessage guards `cid !== null`).
    // This matches the LIVE `assistantTurnDelta({characterId:null})` twin — no drift.
    await seedMessage(db, {
      chatId,
      seq: 3,
      role: "assistant",
      characterId: null, // agent-authored: no character
      createdAt: T0,
      variants: [
        {
          content: "buddy speaks",
          model: "gpt",
          provider: "openrouter",
          tokensIn: 7,
          tokensOut: 11,
        },
      ],
    });

    const clock = createFrozenClock(T0 + 999);
    await reconcileStats(db, { ownerId, now: clock.now });

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    // The host now counts BOTH assistant turns (the character's + the agent's).
    expect(owner?.assistantTurns).toBe(2);
    expect(owner?.tokensIn).toBe(19); // 12 (character msg+swipe) + 7 (agent)
    expect(owner?.tokensOut).toBe(35); // 24 + 11

    // character_stats is UNCHANGED — the agent row carries no characterId, so it never folds to a char row.
    const char = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    expect(char?.assistantTurns).toBe(1); // still just the character's own turn
    expect(char?.tokensIn).toBe(12);
    // No stray character_stats row was minted for the agent (there is exactly one char row — the character's).
    expect(await db.select().from(characterStats)).toHaveLength(1);
  });

  test("re-running is idempotent — the atomic per-owner replace doesn't double-count", async () => {
    // Inject the global frozen clock and `advance` it between runs (the determinism seam, Spine-Testing.md §4).
    const clock = createFrozenClock(T0 + 1);
    await reconcileStats(db, { ownerId, now: clock.now });
    clock.advance(1);
    await reconcileStats(db, { ownerId, now: clock.now });
    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.tokensIn).toBe(12); // not 24
    const chars = await db.select().from(characterStats);
    expect(chars).toHaveLength(1); // replaced, not duplicated
    expect(owner?.computedAt).toBe(T0 + 2); // MAX(computedAt) — the advanced second run wins
  });

  test("a canon write held inside the scan is included instead of being overwritten by the stale rebuild", async () => {
    const held = holdOwnerScan(db);

    const rebuilding = reconcileStats(held.heldDb, { ownerId, now: () => T0 + 3000 });
    await held.entered;
    const content = "arrived during rebuild";
    const now = T0 + 2000;
    const statements: BatchStmt[] = insertCanonMessageStatements(db, {
      messageId: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      chatId,
      seq: 3,
      role: "assistant",
      characterId,
      now,
      variant: { content, model: testModelId("gpt"), provider: testProviderId("openrouter") },
    });
    applyStatsDelta(statements, db, assistantTurnDelta({ ownerId, characterId, economics: { content, model: "gpt", provider: "openrouter" }, now }));
    await db.batch(batchMany(statements));
    held.release();
    await rebuilding;

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.assistantTurns).toBe(2);
    expect(owner?.assistantWords).toBe(6);
    expect(held.snapshotCalls()).toBe(4);
  });

  test("a version-only attribution write held inside the scan restarts the rebuild", async () => {
    const nextCharacterId = await seedCharacter(db, ownerId, { id: "character_next", name: "Bryn" });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_next"),
      chatId,
      kind: "character",
      characterId: nextCharacterId,
      role: "member",
      joinSeq: 0,
    });
    const held = holdOwnerScan(db);

    const rebuilding = reconcileStats(held.heldDb, { ownerId, now: () => T0 + 3000 });
    await held.entered;
    const statements: BatchStmt[] = [reattributeMessagesStatement(db, chatId, [assistantMessageId], nextCharacterId)];
    bumpStatsCanonVersion(statements, db, ownerId);
    await db.batch(batchMany(statements));
    held.release();
    await rebuilding;

    const previous = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    const next = (await db.select().from(characterStats).where(eq(characterStats.characterId, nextCharacterId)))[0];
    // The re-attributed-away character KEEPS its census row — it still holds a seat in the room (#1147);
    // what moved is the ECONOMICS, and a zeroed row is the sharper proof of that than an absent one.
    expect(previous).toMatchObject({ chats: 1, assistantTurns: 0, swipes: 0, contentBytes: 0 });
    expect(next?.assistantTurns).toBe(1);
    expect(next?.swipes).toBe(1);
    expect(held.snapshotCalls()).toBe(4);
  });

  test("an unrelated owner's canon write does not restart the held owner rebuild", async () => {
    const otherOwnerId = await seedUser(db, "user_other", "user");
    const otherCharacterId = await seedCharacter(db, otherOwnerId, { id: "character_other", name: "Bryn" });
    const otherChatId = await seedChat(db, otherCharacterId, { id: "chat_other", createdAt: T0, updatedAt: T0 });
    const held = holdOwnerScan(db);

    const rebuilding = reconcileStats(held.heldDb, { ownerId, now: () => T0 + 3000 });
    await held.entered;
    const content = "other owner arrived";
    const now = T0 + 2000;
    const statements: BatchStmt[] = insertCanonMessageStatements(db, {
      messageId: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      chatId: otherChatId,
      seq: 1,
      role: "assistant",
      characterId: otherCharacterId,
      now,
      variant: { content },
    });
    applyStatsDelta(statements, db, assistantTurnDelta({ ownerId: otherOwnerId, characterId: otherCharacterId, economics: { content }, now }));
    await db.batch(batchMany(statements));
    held.release();
    await rebuilding;

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.assistantTurns).toBe(1);
    expect(held.snapshotCalls()).toBe(2);
  });
});
