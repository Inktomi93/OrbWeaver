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
      tokensIn: 200,
      tokensOut: 2000,
      tokensInMeasuredSamples: 1,
      tokensOutMeasuredSamples: 1,
      genTimeMs: 1000,
      reasoningGenerations: 1,
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
    });
    const o = await readOverview(db, ownerId);
    expect(o?.totalGenTimeMs).toBe(1000); // genTimeMs column → totalGenTimeMs view field
    expect(o?.throughputTps).toBe(2000); // 2000 tokensOut / (1000ms / 1000)
    expect(o?.reasoningRate).toBe(0.25); // 1 / (3 + 1)
    // The share of INPUT tokens served from cache — NOT read/(read+write), which was 1.0 on every backend
    // that reports reads but not writes (P1a). 30 / 200.
    expect(o?.cacheHitRate).toBe(0.15);
    // Latency percentiles are on-read; no canon here → null.
    expect(o?.avgTtftMs).toBeNull();
  });

  // THE READ TELLS ABSENCE FROM ZERO (P1a/P2a). An imported library produces exactly this row: real
  // replies and swipes, no usage columns at all. It used to read `100%` cache, `0 tok`, `$0.00`.
  test("an imported-shaped rollup — turns but no usage — reads UNRECORDED, not zero", async () => {
    await seedOwnerStats(db, ownerId, { assistantTurns: 1187, swipes: 7526, genTimeMs: 900_000 });
    const o = await readOverview(db, ownerId);
    expect(o?.tokensIn).toBeNull();
    expect(o?.tokensOut).toBeNull();
    expect(o?.costUsd).toBeNull();
    expect(o?.cacheHitRate).toBeNull();
    // Word counts are NOT usage — they are computed from the text, so they stay real numbers.
    expect(o?.assistantWords).toBe(0);
  });

  test("estimated samples stay visible, dominate mixed token totals, and never imply dollar cost", async () => {
    await seedOwnerStats(db, ownerId, {
      assistantTurns: 2,
      tokensIn: 120,
      tokensOut: 80,
      tokensInMeasuredSamples: 1,
      tokensInEstimatedSamples: 1,
      tokensOutMeasuredSamples: 1,
      tokensOutEstimatedSamples: 1,
      costUsd: 0,
      costSamples: 0,
    });
    const o = await readOverview(db, ownerId);
    expect(o).toMatchObject({
      tokensIn: 120,
      tokensOut: 80,
      tokensInProvenance: "estimated",
      tokensOutProvenance: "estimated",
      costUsd: null,
    });
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
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]?.characterId).toBe(mine);
    // The census counts MY ranked characters only — the other owner's is not in it.
    expect(board.total).toBe(1);
  });

  test("leaderboard sorts by the requested column", async () => {
    const a = await seedCharacter(db, ownerId, { id: "character_a", name: "A" });
    const b = await seedCharacter(db, ownerId, { id: "character_b", name: "B" });
    await seedCharacterStats(db, a, { assistantTurns: 1, swipes: 9 });
    await seedCharacterStats(db, b, { assistantTurns: 5, swipes: 1 });
    const byTurns = await readLeaderboard(db, ownerId, { sort: "assistantTurns" });
    expect(byTurns.rows[0]?.characterId).toBe(b);
    const bySwipes = await readLeaderboard(db, ownerId, { sort: "swipes" });
    expect(bySwipes.rows[0]?.characterId).toBe(a);
  });

  // "ANALYTICS 50" read as a census of a 330-character library (P2g). `rows.length` on a capped page IS
  // the cap, so the page carries the population it was cut from and the band states a relationship.
  test("the page carries the UNCAPPED ranked total beside the capped rows", async () => {
    await Promise.all(
      [1, 2, 3, 4, 5].map(async (n) => {
        const id = await seedCharacter(db, ownerId, { id: `character_${n}`, name: `C${n}` });
        await seedCharacterStats(db, id, { assistantTurns: n });
      }),
    );
    const page = await readLeaderboard(db, ownerId, { limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  test("a leaderboard row with turns but no usage reports UNRECORDED tokens", async () => {
    const c = await seedCharacter(db, ownerId, { id: "character_q", name: "Q" });
    await seedCharacterStats(db, c, { assistantTurns: 892, swipes: 3213 });
    const page = await readLeaderboard(db, ownerId);
    expect(page.rows[0]?.tokensOut).toBeNull();
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

  // The per-model half of P1a/P2a: 50 model rows all reading `0 tok · $0.00` while none of them had
  // accounting at all — every one of those is an imported bucket, and the read now says so.
  test("a model bucket with generations but no usage reports UNRECORDED tokens, cost and cache rate", async () => {
    await seedModelStats(db, ownerId, { model: "imported", provider: "openrouter", generations: 26_636 });
    const rows = await readByModel(db, ownerId);
    expect(rows[0]?.tokensIn).toBeNull();
    expect(rows[0]?.tokensOut).toBeNull();
    expect(rows[0]?.costUsd).toBeNull();
    expect(rows[0]?.cacheHitRate).toBeNull();
  });

  test("a model bucket with cache reads reports the share of INPUT tokens, not 100%", async () => {
    await seedModelStats(db, ownerId, {
      model: "opus",
      provider: "openrouter",
      generations: 3,
      tokensIn: 1_664_309,
      tokensOut: 1748,
      cacheReadTokens: 32_217,
      cacheWriteTokens: 0,
    });
    expect((await readByModel(db, ownerId))[0]?.cacheHitRate).toBeCloseTo(0.019_36, 5);
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

  // P1b: the CONTEXT panel names the drilled character, so the tab that CAN narrow to them must.
  // personaUsage is a live canon GROUP BY (unlike the model/daily rollups), so it can.
  test("characterId narrows the chat set to that character's chats", async () => {
    const persona = await seedPersona(db, ownerId, { name: "Hero" });
    const a = await seedCharacter(db, ownerId, { id: "character_a", name: "A" });
    const b = await seedCharacter(db, ownerId, { id: "character_b", name: "B" });
    const chatA = await seedChat(db, a, { id: "chat_a", anchorPersonaId: persona, updatedAt: T0 + 100 });
    const chatB = await seedChat(db, b, { id: "chat_b", anchorPersonaId: persona, updatedAt: T0 + 200 });
    await seedMessage(db, { chatId: chatA, seq: 1, role: "assistant", characterId: a, variants: [{ content: "a", tokensOut: 3 }] });
    await seedMessage(db, { chatId: chatB, seq: 1, role: "assistant", characterId: b, variants: [{ content: "b", tokensOut: 11 }] });

    const all = await readPersonaUsage(db, ownerId);
    expect(all[0]?.chatCount).toBe(2);
    expect(all[0]?.messageCount).toBe(2);

    const scoped = await readPersonaUsage(db, ownerId, { characterId: b });
    expect(scoped[0]?.chatCount).toBe(1);
    expect(scoped[0]?.messageCount).toBe(1);
    expect(scoped[0]?.tokensOut).toBe(11);
    // The persona stays in the roster at zero rather than vanishing when it never met that character.
    expect(scoped).toHaveLength(1);
  });

  // A characterId the caller does not own is a PROJECTION miss, never a leak: the read is scoped by
  // personas.owner_id, so a foreign id can only ever narrow the caller's OWN chats to none.
  test("another owner's characterId returns the caller's roster at zero, never their data", async () => {
    const persona = await seedPersona(db, ownerId, { name: "Hero" });
    const mine = await seedCharacter(db, ownerId, { id: "character_mine", name: "Mine" });
    const chatId = await seedChat(db, mine, { anchorPersonaId: persona });
    await seedMessage(db, { chatId, seq: 1, role: "assistant", characterId: mine, variants: [{ content: "hi", tokensOut: 5 }] });
    const other = await seedUser(db, "user_other", "user");
    const theirs = await seedCharacter(db, other, { id: "character_theirs", name: "Theirs" });

    const rows = await readPersonaUsage(db, ownerId, { characterId: theirs });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Hero");
    expect(rows[0]?.chatCount).toBe(0);
    expect(rows[0]?.messageCount).toBe(0);
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
