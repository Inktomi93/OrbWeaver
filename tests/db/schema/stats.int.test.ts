// .int tests for schema/stats (the four usage-economics rollups). Real libSQL :memory: via freshDb
// (FK PRAGMA ON). Covers: round-trips for all four tables; the D23 ownership shape (character_stats has
// NO `ownerId`, keyed by `characterId`; owner/daily/model KEEP `ownerId`); `model_stats.provider` NOT NULL
// DEFAULT '(unknown)'; the character_stats→characters CASCADE; FK enforcement on every `ownerId`/
// `characterId`; the `(owner, model, provider)` unique-index conflict; and the epoch-ms NUMBER timestamps
// (never Date). ZERO vector columns is enforced structurally by the dep-cruiser gate, not here.

import type { Db } from "@orb/db";
import { characterStats, characters, dailyStats, modelStats, ownerStats } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { CharacterId, CharacterStatId, DailyStatId, ModelStatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: `card-${id}`,
    ownerId,
    contentHash: "hash-of-semantic-fields",
    name: "Stat Subject",
  });
  return characterId;
}

// ── owner_stats: natural PK round-trip + zero defaults + numeric timestamp ─────────────────────────────
test("owner_stats round-trips on its natural ownerId PK (zero defaults, real cost, numeric computedAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_stats", handle: "owner-stats" });

  // A bare insert exercises the column defaults (the all-zeros rollup reconcile always writes).
  await db.insert(ownerStats).values({ ownerId });

  const rows = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.ownerId).toBe(ownerId);
  // Additive counters default to 0; cost is `real`.
  expect(rows[0]?.chats).toBe(0);
  expect(rows[0]?.tokensIn).toBe(0);
  expect(rows[0]?.costUsd).toBe(0);
  expect(rows[0]?.cacheReadTokens).toBe(0);
  // Nullable extrema absent on a bare insert.
  expect(rows[0]?.maxContextTokens).toBeNull();
  expect(rows[0]?.firstChatAt).toBeNull();
  expect(rows[0]?.lastActivityAt).toBeNull();
  // computedAt is a born-at-insert EPOCH-MS NUMBER (never a Date).
  expect(rows[0]?.computedAt).toBeTypeOf("number");
});

test("owner_stats accepts explicit economics values incl. numeric extrema", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_vals", handle: "owner-vals" });
  await db.insert(ownerStats).values({
    ownerId,
    characters: 3,
    chats: 12,
    assistantTurns: 40,
    tokensIn: 1000,
    tokensOut: 2000,
    costUsd: 1.25,
    cacheReadTokens: 500,
    maxContextTokens: 128_000,
    firstChatAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_500_000,
    computedAt: 1_700_000_900_000,
  });

  const rows = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId));
  expect(rows[0]?.characters).toBe(3);
  expect(rows[0]?.costUsd).toBe(1.25);
  expect(rows[0]?.maxContextTokens).toBe(128_000);
  expect(rows[0]?.firstChatAt).toBeTypeOf("number");
  expect(rows[0]?.lastActivityAt).toBe(1_700_000_500_000);
});

// The natural PK is single-per-user: a second owner_stats row for the same user collides as UNIQUE.
test("owner_stats is one row per user (the natural PK rejects a duplicate)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_dup", handle: "owner-dup" });
  await db.insert(ownerStats).values({ ownerId });

  let caught: unknown;
  try {
    await db.insert(ownerStats).values({ ownerId });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("owner_stats.ownerId FK is enforced (a missing user is rejected)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(ownerStats).values({ ownerId: castId<UserId>("user_does_not_exist") });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── character_stats: TypeID PK + characterId FK; the D23 NO-ownerId shape ──────────────────────────────
test("character_stats round-trips (TypeID id PK, characterId FK) and carries NO ownerId column (D23 derive)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_stats", handle: "char-stats" });
  const characterId = await seedCharacter(db, ownerId, "character_with_stats");
  const id = castId<CharacterStatId>("character_stat_one");

  await db.insert(characterStats).values({
    id,
    characterId,
    chats: 2,
    assistantTurns: 9,
    tokensOut: 4321,
    costUsd: 0.5,
    lastActivityAt: 1_700_000_000_000,
  });

  const rows = await db.select().from(characterStats).where(eq(characterStats.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.characterId).toBe(characterId);
  expect(rows[0]?.assistantTurns).toBe(9);
  expect(rows[0]?.tokensOut).toBe(4321);
  expect(rows[0]?.costUsd).toBe(0.5);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
  // D23: character_stats DERIVES the owner via characterId → characters.ownerId — there is NO ownerId
  // column on the row (the per-character rollup has a single owning parent).
  expect("ownerId" in (rows[0] ?? {})).toBe(false);
});

// One rollup row per character — the live-delta UPSERT conflict target (unique on characterId).
test("character_stats is one row per character (the characterId unique rejects a duplicate)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_dup", handle: "char-dup" });
  const characterId = await seedCharacter(db, ownerId, "character_dup_stats");
  await db.insert(characterStats).values({ id: castId<CharacterStatId>("character_stat_dup_a"), characterId });

  let caught: unknown;
  try {
    await db.insert(characterStats).values({ id: castId<CharacterStatId>("character_stat_dup_b"), characterId });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("character_stats.characterId FK is enforced (a missing character is rejected)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(characterStats).values({
      id: castId<CharacterStatId>("character_stat_orphan"),
      characterId: castId<CharacterId>("character_does_not_exist"),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting a character CASCADEs its character_stats row (the rollup dies with its character)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_cascade", handle: "char-cascade" });
  const characterId = await seedCharacter(db, ownerId, "character_cascade_stats");
  await db.insert(characterStats).values({ id: castId<CharacterStatId>("character_stat_cascade"), characterId });

  await db.delete(characters).where(eq(characters.id, characterId));

  const rows = await db.select().from(characterStats).where(eq(characterStats.characterId, characterId));
  expect(rows).toHaveLength(0);
});

// ── daily_stats: KEEPS ownerId; owner×day unique; message-stream credit ────────────────────────────────
test("daily_stats round-trips (KEEPS ownerId, day bucket, OR-flag default false, numeric computedAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_daily", handle: "daily" });
  const id = castId<DailyStatId>("daily_stat_one");

  await db.insert(dailyStats).values({
    id,
    ownerId,
    day: "2026-06-26",
    chatsCreated: 1,
    assistantTurns: 5,
    tokensIn: 800,
    tokensOut: 1600,
    costUsd: 0.25,
  });

  const rows = await db.select().from(dailyStats).where(eq(dailyStats.id, id));
  expect(rows).toHaveLength(1);
  // D23 KEEP: daily_stats is a parentless owner×day aggregate — ownerId is its own key.
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.day).toBe("2026-06-26");
  expect(rows[0]?.tokensOut).toBe(1600);
  // The migration-approximate flag is a boolean defaulting to false (OR-merged in the upsert).
  expect(rows[0]?.messageDatesApprox).toBe(false);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
});

test("daily_stats is one row per (owner, day) (the composite unique rejects a duplicate day)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_daily_dup", handle: "daily-dup" });
  await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_dup_a"), ownerId, day: "2026-06-26" });

  let caught: unknown;
  try {
    await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_dup_b"), ownerId, day: "2026-06-26" });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("daily_stats.ownerId FK is enforced (a missing user is rejected)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(dailyStats).values({
      id: castId<DailyStatId>("daily_stat_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      day: "2026-06-26",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── model_stats: KEEPS ownerId; the load-bearing (unknown) provider default; owner×model×provider unique ─
test("model_stats.provider defaults to '(unknown)' when omitted (the load-bearing NOT NULL sentinel)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_model_default", handle: "model-default" });
  const id = castId<ModelStatId>("model_stat_default");

  // No `provider` supplied — the column default fills the sentinel so the (owner, model, provider) unique
  // never splits on a NULL (SQLite NULLs are DISTINCT).
  await db.insert(modelStats).values({ id, ownerId, model: "claude-opus-4-8", generations: 3 });

  const rows = await db.select().from(modelStats).where(eq(modelStats.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.provider).toBe("(unknown)");
  expect(rows[0]?.ownerId).toBe(ownerId); // D23 KEEP — owner×model×provider parentless aggregate
  expect(rows[0]?.generations).toBe(3);
  expect(rows[0]?.cacheWriteTokens).toBe(0);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
});

test("model_stats round-trips an explicit provider and economics", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_model_vals", handle: "model-vals" });
  const id = castId<ModelStatId>("model_stat_vals");
  await db.insert(modelStats).values({
    id,
    ownerId,
    model: "claude-opus-4-8",
    provider: "anthropic",
    generations: 10,
    tokensIn: 5000,
    tokensOut: 9000,
    costUsd: 3.14,
    cacheReadTokens: 1200,
  });

  const rows = await db.select().from(modelStats).where(eq(modelStats.id, id));
  expect(rows[0]?.provider).toBe("anthropic");
  expect(rows[0]?.costUsd).toBe(3.14);
  expect(rows[0]?.cacheReadTokens).toBe(1200);
});

test("model_stats unique is (owner, model, provider) — same triple collides, different provider coexists", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_model_unique", handle: "model-unique" });
  await db.insert(modelStats).values({
    id: castId<ModelStatId>("model_stat_u1"),
    ownerId,
    model: "claude-opus-4-8",
    provider: "anthropic",
  });

  // Same (owner, model, provider) → collide.
  let caught: unknown;
  try {
    await db.insert(modelStats).values({
      id: castId<ModelStatId>("model_stat_u2"),
      ownerId,
      model: "claude-opus-4-8",
      provider: "anthropic",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // Same (owner, model) but a DIFFERENT provider is a distinct bucket — no collision.
  await db.insert(modelStats).values({
    id: castId<ModelStatId>("model_stat_u3"),
    ownerId,
    model: "claude-opus-4-8",
    provider: "openrouter",
  });
  const all = await db
    .select()
    .from(modelStats)
    .where(and(eq(modelStats.ownerId, ownerId), eq(modelStats.model, "claude-opus-4-8")));
  expect(all).toHaveLength(2);
});

test("model_stats.ownerId FK is enforced (a missing user is rejected)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(modelStats).values({
      id: castId<ModelStatId>("model_stat_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      model: "m",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── The D23 ownership shape, asserted at the table level ───────────────────────────────────────────────
test("D23 ownership split: owner/daily/model KEEP ownerId; character_stats has NO ownerId column", () => {
  // KEEP `ownerId` — parentless per-user aggregates.
  expect(ownerStats.ownerId).toBeDefined();
  expect(dailyStats.ownerId).toBeDefined();
  expect(modelStats.ownerId).toBeDefined();
  // DERIVE — character_stats reaches the owner via characterId → characters.ownerId (no own column).
  expect("ownerId" in characterStats).toBe(false);
  expect(characterStats.characterId).toBeDefined();
});
