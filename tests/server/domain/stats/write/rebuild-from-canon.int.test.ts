// reconcileStats — the full streaming rebuild from canon (D26: economics on the SELECTED variant; swipes
// are the non-selected variants). Asserts the additive folds + the extrema + the daily/model split against
// a known canon graph, and that a re-run is idempotent (the atomic per-owner delete+replace, esoteric #11).

import type { Db } from "@orb/db";
import { characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { utcDay } from "@orb/kit/stats-tally";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedPersona, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId, { name: "Aria" });
  const personaId = await seedPersona(db, ownerId);
  const chatId = await seedChat(db, characterId, { createdAt: T0, updatedAt: T0 + 1000 });
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
  await seedMessage(db, {
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

    const char = (
      await db.select().from(characterStats).where(eq(characterStats.characterId, characterId))
    )[0];
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
});
