// persistence/rollups — the rollup-table reads + read-derived rates + the D23/D28 owner-scoping (the
// character reads JOIN characters on the owner; character_stats has no ownerId) + the D18 live personaUsage.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  readByModel,
  readCharacter,
  readFreshness,
  readLeaderboard,
  readOverview,
  readPersonaUsage,
  readTemporal,
  readTimeseries,
  readWrapped,
} from "../../../../../packages/server/src/domain/stats/persistence/rollups.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  seedCharacter,
  seedCharacterStats,
  seedChat,
  seedDailyStats,
  seedMessage,
  seedModelStats,
  seedOwnerStats,
  seedPersona,
  seedUser,
  T0,
} from "../_support.ts";

let db: Db;
let ownerId: UserId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
});

describe("readOverview", () => {
  test("projects the owner rollup + derives rates; null when there is no row", async () => {
    expect(await readOverview(db, ownerId)).toBeNull();
    await seedOwnerStats(db, ownerId, {
      assistantTurns: 3,
      swipes: 1,
      tokensOut: 2000,
      genTimeMs: 1000,
      reasoningGenerations: 1,
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
    });
    const o = await readOverview(db, ownerId);
    expect(o?.totalGenTimeMs).toBe(1000); // genTimeMs column → totalGenTimeMs view field
    expect(o?.throughputTps).toBe(2000); // 2000 tokensOut / (1000ms / 1000)
    expect(o?.reasoningRate).toBe(0.25); // 1 / (3 + 1)
    expect(o?.cacheHitRate).toBe(0.75); // 30 / (30 + 10)
    // Latency percentiles are on-read; no canon here → null.
    expect(o?.avgTtftMs).toBeNull();
  });
});

describe("readCharacter / readLeaderboard owner-scoping (D23 — no ownerId on character_stats)", () => {
  test("character read joins on the owner and returns null for another owner's character", async () => {
    const mine = await seedCharacter(db, ownerId, { id: "character_mine", name: "Mine" });
    await seedCharacterStats(db, mine, { assistantTurns: 5 });
    const other = await seedUser(db, "user_other", "user");
    const theirs = await seedCharacter(db, other, { id: "character_theirs", name: "Theirs" });
    await seedCharacterStats(db, theirs, { assistantTurns: 9 });

    const c = await readCharacter(db, ownerId, mine);
    expect(c?.name).toBe("Mine");
    expect(c?.assistantTurns).toBe(5);
    // Another owner's character is not visible to me.
    expect(await readCharacter(db, ownerId, theirs)).toBeNull();

    const board = await readLeaderboard(db, ownerId);
    expect(board).toHaveLength(1);
    expect(board[0]?.characterId).toBe(mine);
  });

  test("leaderboard sorts by the requested column", async () => {
    const a = await seedCharacter(db, ownerId, { id: "character_a", name: "A" });
    const b = await seedCharacter(db, ownerId, { id: "character_b", name: "B" });
    await seedCharacterStats(db, a, { assistantTurns: 1, swipes: 9 });
    await seedCharacterStats(db, b, { assistantTurns: 5, swipes: 1 });
    const byTurns = await readLeaderboard(db, ownerId, { sort: "assistantTurns" });
    expect(byTurns[0]?.characterId).toBe(b);
    const bySwipes = await readLeaderboard(db, ownerId, { sort: "swipes" });
    expect(bySwipes[0]?.characterId).toBe(a);
  });
});

describe("readTimeseries / readTemporal", () => {
  test("timeseries filters to the [from, to] window, ascending", async () => {
    await seedDailyStats(db, ownerId, "2025-06-01", { userTurns: 1 });
    await seedDailyStats(db, ownerId, "2025-06-05", { userTurns: 2 });
    await seedDailyStats(db, ownerId, "2025-06-10", { userTurns: 3 });
    const points = await readTimeseries(db, ownerId, { from: "2025-06-02", to: "2025-06-09" });
    expect(points.map((p) => p.day)).toEqual(["2025-06-05"]);
  });

  test("temporal derives active days + busiest day from daily_stats", async () => {
    await seedDailyStats(db, ownerId, "2025-06-01", { userTurns: 1, assistantTurns: 1 });
    await seedDailyStats(db, ownerId, "2025-06-02", { userTurns: 5, assistantTurns: 5 });
    const t = await readTemporal(db, ownerId);
    expect(t.activeDays).toBe(2);
    expect(t.busiestDay?.day).toBe("2025-06-02");
    expect(t.longestStreakDays).toBe(2); // consecutive days
  });
});

describe("readByModel", () => {
  test("projects model_stats + merges canon reach (distinct characters via the selected variant)", async () => {
    const ch = await seedCharacter(db, ownerId, { id: "character_a" });
    const chatId = await seedChat(db, ch);
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId: ch,
      variants: [{ content: "hi", model: "gpt", provider: "openrouter", tokensOut: 5 }],
    });
    await seedModelStats(db, ownerId, { model: "gpt", provider: "openrouter", generations: 3 });
    const rows = await readByModel(db, ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.generations).toBe(3);
    expect(rows[0]?.charactersUsedWith).toBe(1); // reach from canon
  });
});

describe("readFreshness", () => {
  test("hasData=false / null when no rollup; stale always false", async () => {
    expect(await readFreshness(db, ownerId)).toEqual({
      computedAt: null,
      stale: false,
      hasData: false,
    });
    await seedOwnerStats(db, ownerId, { computedAt: T0 });
    expect(await readFreshness(db, ownerId)).toEqual({
      computedAt: T0,
      stale: false,
      hasData: true,
    });
  });
});

describe("readPersonaUsage (D18 — anchor persona OR a participant's active persona)", () => {
  test("counts a persona's chats + messages + selected-variant tokensOut", async () => {
    const persona = await seedPersona(db, ownerId, { name: "Hero" });
    const ch = await seedCharacter(db, ownerId, { id: "character_a" });
    const chatId = await seedChat(db, ch, { anchorPersonaId: persona, updatedAt: T0 + 500 });
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId: ch,
      variants: [{ content: "hi", tokensOut: 7 }],
    });
    const rows = await readPersonaUsage(db, ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Hero");
    expect(rows[0]?.chatCount).toBe(1);
    expect(rows[0]?.messageCount).toBe(1);
    expect(rows[0]?.tokensOut).toBe(7);
    expect(rows[0]?.lastUsedAt).toBe(T0 + 500);
  });
});

describe("readWrapped", () => {
  test("assembles the headline from the owner rollup + leaderboard top; null with no rollup", async () => {
    expect(await readWrapped(db, ownerId)).toBeNull();
    const ch = await seedCharacter(db, ownerId, { id: "character_a", name: "Star" });
    await seedOwnerStats(db, ownerId, { assistantTurns: 4, userWords: 10, assistantWords: 20 });
    await seedCharacterStats(db, ch, { assistantTurns: 4 });
    const w = await readWrapped(db, ownerId);
    expect(w?.words).toBe(30);
    expect(w?.replies).toBe(4);
    expect(w?.topCharacter?.name).toBe("Star");
  });
});
