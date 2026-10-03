// .int tests for schema/stats (the four usage-economics rollups). Real libSQL :memory: via freshDb
// (FK PRAGMA ON). Covers: round-trips for all four tables; the D23 ownership shape (character_stats has
// NO `ownerId`, keyed by `characterId`; owner/daily/model KEEP `ownerId`); `model_stats.provider` NOT NULL
// DEFAULT '(unknown)'; the character_stats→characters CASCADE; FK enforcement on every `ownerId`/
// `characterId`; the `(owner, model, provider)` unique-index conflict; and the epoch-ms NUMBER timestamps
// (never Date). ZERO vector columns is enforced structurally by the dep-cruiser gate, not here.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@orb/db";
import {
  assertReferentialIntegrity,
  characterStats,
  characters,
  createDb,
  dailyStats,
  hasPendingMigrations,
  modelStats,
  ownerStats,
  runMigrations,
} from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, CharacterStatId, DailyStatId, Handle, ModelStatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import { and, eq, sql } from "drizzle-orm";
import { freshDb, SHIPPED_MIGRATIONS, shippedChainThrough } from "../../support/db.ts";
import { seedCharacterAtBaseline } from "../../support/factories/character.ts";
import { expect, test } from "../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../support/inference-identities.ts";
import { seedUser } from "./_support.ts";

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: castId<CharacterHandle>(`card-${id}`),
    ownerId,
    contentHash: "hash-of-semantic-fields",
    name: "Stat Subject",
  });
  return characterId;
}

// ── owner_stats: natural PK round-trip + zero defaults + numeric timestamp ─────────────────────────────
test("owner_stats round-trips on its natural ownerId PK (zero defaults, real cost, numeric computedAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_stats", handle: castId<Handle>("owner-stats") });

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
  const ownerId = await seedUser(db, { id: "user_owner_vals", handle: castId<Handle>("owner-vals") });
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
  const ownerId = await seedUser(db, { id: "user_owner_dup", handle: castId<Handle>("owner-dup") });
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
  const ownerId = await seedUser(db, { id: "user_char_stats", handle: castId<Handle>("char-stats") });
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
  const ownerId = await seedUser(db, { id: "user_char_dup", handle: castId<Handle>("char-dup") });
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
  const ownerId = await seedUser(db, { id: "user_char_cascade", handle: castId<Handle>("char-cascade") });
  const characterId = await seedCharacter(db, ownerId, "character_cascade_stats");
  await db.insert(characterStats).values({ id: castId<CharacterStatId>("character_stat_cascade"), characterId });

  await db.delete(characters).where(eq(characters.id, characterId));

  const rows = await db.select().from(characterStats).where(eq(characterStats.characterId, characterId));
  expect(rows).toHaveLength(0);
});

// ── daily_stats: KEEPS ownerId; owner×bucket unique; message-stream credit ─────────────────────────────
const BUCKET = 1_782_432_000_000;

test("daily_stats round-trips (KEEPS ownerId, quarter-hour bucket, OR-flag default false, numeric computedAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_daily", handle: castId<Handle>("daily") });
  const id = castId<DailyStatId>("daily_stat_one");

  await db.insert(dailyStats).values({
    id,
    ownerId,
    bucketStart: BUCKET,
    chatsCreated: 1,
    assistantTurns: 5,
    tokensIn: 800,
    tokensOut: 1600,
    costUsd: 0.25,
  });

  const rows = await db.select().from(dailyStats).where(eq(dailyStats.id, id));
  expect(rows).toHaveLength(1);
  // D23 KEEP: daily_stats is a parentless owner×bucket aggregate — ownerId is its own key.
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.bucketStart).toBe(BUCKET);
  expect(rows[0]?.tokensOut).toBe(1600);
  // The migration-approximate flag is a boolean defaulting to false (OR-merged in the upsert).
  expect(rows[0]?.messageDatesApprox).toBe(false);
  expect(rows[0]?.computedAt).toBeTypeOf("number");
});

test("daily_stats is one row per (owner, bucket) (the composite unique rejects a duplicate bucket)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_daily_dup", handle: castId<Handle>("daily-dup") });
  await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_dup_a"), ownerId, bucketStart: BUCKET });
  // The next bucket is a different key, so it coexists.
  await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_dup_next"), ownerId, bucketStart: BUCKET + CALENDAR_BUCKET_MS });

  let caught: unknown;
  try {
    await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_dup_b"), ownerId, bucketStart: BUCKET });
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
      bucketStart: BUCKET,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── model_stats: KEEPS ownerId; the load-bearing (unknown) provider default; owner×model×provider unique ─
test("model_stats.provider defaults to '(unknown)' when omitted (the load-bearing NOT NULL sentinel)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_model_default", handle: castId<Handle>("model-default") });
  const id = castId<ModelStatId>("model_stat_default");

  // No `provider` supplied — the column default fills the sentinel so the (owner, model, provider) unique
  // never splits on a NULL (SQLite NULLs are DISTINCT).
  await db.insert(modelStats).values({ id, ownerId, model: testModelId("claude-opus-4-8"), generations: 3 });

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
  const ownerId = await seedUser(db, { id: "user_model_vals", handle: castId<Handle>("model-vals") });
  const id = castId<ModelStatId>("model_stat_vals");
  await db.insert(modelStats).values({
    id,
    ownerId,
    model: testModelId("claude-opus-4-8"),
    provider: testProviderId("anthropic"),
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
  const ownerId = await seedUser(db, { id: "user_model_unique", handle: castId<Handle>("model-unique") });
  await db.insert(modelStats).values({
    id: castId<ModelStatId>("model_stat_u1"),
    ownerId,
    model: testModelId("claude-opus-4-8"),
    provider: testProviderId("anthropic"),
  });

  // Same (owner, model, provider) → collide.
  let caught: unknown;
  try {
    await db.insert(modelStats).values({
      id: castId<ModelStatId>("model_stat_u2"),
      ownerId,
      model: testModelId("claude-opus-4-8"),
      provider: testProviderId("anthropic"),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // Same (owner, model) but a DIFFERENT provider is a distinct bucket — no collision.
  await db.insert(modelStats).values({
    id: castId<ModelStatId>("model_stat_u3"),
    ownerId,
    model: testModelId("claude-opus-4-8"),
    provider: testProviderId("openrouter"),
  });
  const all = await db
    .select()
    .from(modelStats)
    .where(and(eq(modelStats.ownerId, ownerId), eq(modelStats.model, testModelId("claude-opus-4-8"))));
  expect(all).toHaveLength(2);
});

test("model_stats.ownerId FK is enforced (a missing user is rejected)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(modelStats).values({
      id: castId<ModelStatId>("model_stat_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      model: testModelId("m"),
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

const PRE_RENAME_TAG = "0001_native-google";
const PRE_REGRAIN_TAG = "0004_character-import-text-hash";

test("the forward content-unit migration preserves populated rollups, signed counts and daily grain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-stats-content-migration-"));
  try {
    const preRename = shippedChainThrough(join(dir, "pre-rename"), PRE_RENAME_TAG);
    const preRegrain = shippedChainThrough(join(dir, "pre-regrain"), PRE_REGRAIN_TAG);
    const db = await createDb(":memory:");
    await runMigrations(db, preRename);
    const ownerId = await seedUser(db, { id: "user_content_migration", handle: castId<Handle>("content-migration") });
    const { id: characterId } = await seedCharacterAtBaseline(db, { ownerId });
    const characterStatId = mintTypeId(ID_PREFIX.characterStat);
    const dailyStatId = mintTypeId(ID_PREFIX.dailyStat);
    await db.run(sql`INSERT INTO owner_stats (owner_id, content_bytes, user_turns, system_turns, cost_usd, computed_at)
      VALUES (${ownerId}, 17, 5, 2, 1.75, 1700000000000)`);
    await db.run(sql`INSERT INTO character_stats (id, character_id, content_bytes, assistant_turns, system_turns, computed_at)
      VALUES (${characterStatId}, ${characterId}, -9, 4, 1, 1700000000000)`);
    await db.run(sql`INSERT INTO daily_stats (id, owner_id, day, user_turns, system_turns, tokens_out, message_dates_approx, computed_at)
      VALUES (${dailyStatId}, ${ownerId}, '2026-06-26', 3, 7, 11, 1, 1700000000000)`);
    const beforeOwner = await db.get<Record<string, unknown>>(sql`SELECT * FROM owner_stats WHERE owner_id = ${ownerId}`);
    const beforeCharacter = await db.get<Record<string, unknown>>(sql`SELECT * FROM character_stats WHERE character_id = ${characterId}`);
    const beforeDaily = await db.get<Record<string, unknown>>(sql`SELECT * FROM daily_stats WHERE owner_id = ${ownerId}`);
    expect(beforeOwner?.["content_bytes"]).toBe(17);
    expect(beforeCharacter?.["content_bytes"]).toBe(-9);
    expect(beforeDaily?.["system_turns"]).toBe(7);
    expect(await hasPendingMigrations(db, preRegrain)).toBe(true);
    await runMigrations(db, preRegrain);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
    const afterOwner = await db.get<Record<string, unknown>>(sql`SELECT * FROM owner_stats WHERE owner_id = ${ownerId}`);
    const afterCharacter = await db.get<Record<string, unknown>>(sql`SELECT * FROM character_stats WHERE character_id = ${characterId}`);
    const afterDaily = await db.get<Record<string, unknown>>(sql`SELECT * FROM daily_stats WHERE owner_id = ${ownerId}`);
    const renamed = (row: Record<string, unknown> | undefined): Record<string, unknown> =>
      Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [key === "content_bytes" ? "content_chars" : key, value]));
    expect(afterOwner).toEqual(renamed(beforeOwner));
    expect(afterCharacter).toEqual(renamed(beforeCharacter));
    expect(afterDaily).toEqual(beforeDaily);
    expect(afterDaily).not.toHaveProperty("content_chars");
    expect(await hasPendingMigrations(db, preRegrain)).toBe(false);
    await runMigrations(db, preRegrain);
    expect(await db.get(sql`SELECT * FROM owner_stats WHERE owner_id = ${ownerId}`)).toEqual(afterOwner);
    expect(await db.get(sql`SELECT * FROM character_stats WHERE character_id = ${characterId}`)).toEqual(afterCharacter);
    expect((await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`))?.["foreign_keys"]).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the timeline re-grain migration replaces the day-keyed daily_stats with an empty quarter-hour table and keeps every other rollup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-stats-regrain-migration-"));
  try {
    const db = await createDb(":memory:");
    await runMigrations(db, shippedChainThrough(dir, PRE_REGRAIN_TAG));
    const ownerId = await seedUser(db, { id: "user_regrain_migration", handle: castId<Handle>("regrain-migration") });
    await db.run(sql`INSERT INTO owner_stats (owner_id, user_turns, assistant_turns, computed_at) VALUES (${ownerId}, 3, 4, 1700000000000)`);
    await db.run(sql`INSERT INTO daily_stats (id, owner_id, day, user_turns, computed_at)
      VALUES (${mintTypeId(ID_PREFIX.dailyStat)}, ${ownerId}, '2026-06-26', 3, 1700000000000)`);
    const beforeOwner = await db.get<Record<string, unknown>>(sql`SELECT * FROM owner_stats WHERE owner_id = ${ownerId}`);

    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(true);
    await runMigrations(db, SHIPPED_MIGRATIONS);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();

    // A day row cannot be split into the quarter-hours it came from, so the migration drops it; the boot
    // step rebuilds the timeline from canon (`tests/server/entry/boot/rebuild-stats-timeline.int.test.ts`).
    expect(await db.all(sql`SELECT * FROM daily_stats`)).toEqual([]);
    const columns = await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('daily_stats')`);
    expect(columns.map((c) => c.name)).toContain("bucket_start");
    expect(columns.map((c) => c.name)).not.toContain("day");
    expect(await db.get(sql`SELECT * FROM owner_stats WHERE owner_id = ${ownerId}`)).toEqual(beforeOwner);

    // The rebuilt table takes the live schema's rows and enforces the (owner, bucket) key.
    await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_regrain_a"), ownerId, bucketStart: BUCKET, userTurns: 1 });
    let caught: unknown;
    try {
      await db.insert(dailyStats).values({ id: castId<DailyStatId>("daily_stat_regrain_b"), ownerId, bucketStart: BUCKET });
    } catch (err) {
      caught = err;
    }
    expect(isConstraintViolation(caught)?.kind).toBe("unique");
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
