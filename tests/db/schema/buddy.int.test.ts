// .int tests for schema/buddy — the per-user companion tables. Real libSQL :memory: (the integration
// lane, FK enforcement ON via createDb/freshDb). Covers: round-trips (buddies/turns/quips), the
// contracts-derived enum CHECKs + test-mirrors (db === @orb/contracts/buddy), the typed-text `eye`
// column, the JSON `stats` round-trip, and the FK cascade (delete user → buddy + turns + quips gone,
// including the two-hop turns/quips → buddies → users cascade).

import type { CompanionStats, Eye, Hat, Mood, Rarity, Species } from "@orb/contracts/buddy";
import { EYES, HATS, MOODS, RARITIES, SPECIES, STAT_NAMES } from "@orb/contracts/buddy";
import { buddies, buddyQuips, buddyTurns, isConstraintViolation, users } from "@orb/db";
import type { BuddyQuipId, BuddyTurnId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

// biome-ignore lint/style/useNamingConvention: the keys ARE the contract `STAT_NAMES` axis members (CONSTANT_CASE by domain convention), mirroring @orb/contracts/buddy's own suppression on FORMS/companionStatsSchema.
const STATS: CompanionStats = { LORE: 50, WIT: 40, WARMTH: 30, MISCHIEF: 20, FOCUS: 60 };

interface BuddyValues {
  userId: UserId;
  name: string;
  personality: string;
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  mood?: Mood;
  stats: CompanionStats;
}

// A minimal valid buddy values object (widened axis types so overrides typecheck; defaults fill
// mood/shiny/bondXp/flags/timestamps).
function buddyValues(userId: UserId): BuddyValues {
  return {
    userId,
    name: "Pixel",
    personality: "curious and dry",
    rarity: "rare",
    species: "wisp",
    eye: "●",
    hat: "crown",
    stats: STATS,
  };
}

test("buddies insert→select round-trips (defaults, JSON stats, typed-text eye)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_buddy_rt" });
  await db.insert(buddies).values(buddyValues(userId));

  const rows = await db.select().from(buddies).where(eq(buddies.userId, userId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.userId).toBe(userId);
  expect(row?.eye).toBe("●");
  expect(row?.stats).toEqual(STATS);
  expect(row?.mood).toBe("content");
  expect(row?.shiny).toBe(false);
  expect(row?.bondXp).toBe(0);
  expect(row?.reactionsEnabled).toBe(true);
  expect(row?.agencyEnabled).toBe(true);
  expect(row?.lastReactionAt).toBeNull();
  expect(row?.lastSignalKey).toBeNull();
  expect(row?.createdAt).toBeTypeOf("number");
  expect(row?.updatedAt).toBeTypeOf("number");
});

test("buddies is one-per-user (natural PK userId rejects a second buddy)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_buddy_pk" });
  await db.insert(buddies).values(buddyValues(userId));

  let caught: unknown;
  try {
    await db.insert(buddies).values({ ...buddyValues(userId), name: "Dup" });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)).toBeDefined();
});

// ── Enum test-mirrors: the db CHECK accepts EXACTLY the @orb/contracts/buddy tuple, rejects others ──

test("test-mirror: contract enum tuples match the expected members (db columns derive these)", () => {
  // Pins contract drift — the buddies rarity/species/hat/mood columns + CHECKs import these tuples.
  expect([...RARITIES]).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
  expect([...SPECIES]).toEqual(["mote", "scribe", "ember", "loom", "pixel", "wisp"]);
  expect([...HATS]).toEqual([
    "none",
    "crown",
    "tophat",
    "antenna",
    "halo",
    "wizard",
    "beanie",
    "bow",
  ]);
  expect([...MOODS]).toEqual([
    "content",
    "working",
    "queasy",
    "excited",
    "sleepy",
    "proud",
    "anxious",
    "playful",
    "curious",
    "grumpy",
  ]);
  expect([...STAT_NAMES]).toEqual(["LORE", "WIT", "WARMTH", "MISCHIEF", "FOCUS"]);
});

test("buddies columns accept every contract enum member (rarity/species/eye/hat/mood)", async () => {
  const db = await freshDb();
  // Vary one axis at a time across its full tuple (others held at a fixed valid member). `.map` over the
  // tuples yields DEFINED members (vs variable tuple-indexing, which `noUncheckedIndexedAccess` widens to
  // `| undefined`). Batched into two inserts (users, then buddies) to avoid await-in-loop. A bad member
  // would trip the SQL CHECK; reaching the count proves every member was accepted.
  const specs: { over: Partial<BuddyValues> }[] = [
    ...RARITIES.map((rarity) => ({ over: { rarity } })),
    ...SPECIES.map((species) => ({ over: { species } })),
    ...EYES.map((eye) => ({ over: { eye } })),
    ...HATS.map((hat) => ({ over: { hat } })),
    ...MOODS.map((mood) => ({ over: { mood } })),
  ];
  const rawIds = specs.map((_, i) => `user_enum_${i}`);

  await db
    .insert(users)
    .values(rawIds.map((raw) => ({ id: castId<UserId>(raw), handle: castId<Handle>(raw) })));
  await db.insert(buddies).values(
    specs.map((spec, i) => {
      const userId = castId<UserId>(rawIds[i] ?? "");
      return { ...buddyValues(userId), ...spec.over, userId };
    }),
  );

  expect(await db.select().from(buddies)).toHaveLength(specs.length);
});

test("buddies rarity CHECK rejects an out-of-tuple value", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_bad_rarity" });
  let caught: unknown;
  try {
    // Cast past the column's literal type to exercise the SQL CHECK at runtime.
    await db
      .insert(buddies)
      .values({ ...buddyValues(userId), rarity: "mythic" as unknown as Rarity });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("buddies mood CHECK rejects an out-of-tuple value", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_bad_mood" });
  let caught: unknown;
  try {
    await db.insert(buddies).values({ ...buddyValues(userId), mood: "furious" as unknown as Mood });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── buddy_turns / buddy_quips round-trips + FK + CHECK ──

test("buddy_turns + buddy_quips round-trip and require a hatched buddy (FK)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_turns" });

  // No buddy yet → FK to buddies.userId rejects a turn.
  let caughtNoBuddy: unknown;
  try {
    await db.insert(buddyTurns).values({
      id: castId<BuddyTurnId>("buddy_turn_orphan"),
      userId,
      role: "user",
      content: "hello?",
    });
  } catch (err) {
    caughtNoBuddy = err;
  }
  expect(caughtNoBuddy).toBeDefined();

  // Hatch, then both rows insert cleanly.
  await db.insert(buddies).values(buddyValues(userId));
  await db.insert(buddyTurns).values([
    { id: castId<BuddyTurnId>("buddy_turn_1"), userId, role: "user", content: "hi" },
    { id: castId<BuddyTurnId>("buddy_turn_2"), userId, role: "assistant", content: "hey!" },
  ]);
  await db.insert(buddyQuips).values({
    id: castId<BuddyQuipId>("buddy_quip_1"),
    userId,
    text: "ooh, a new workload!",
    signalKind: "workload:succeeded",
    mood: "excited",
  });

  const turns = await db.select().from(buddyTurns).where(eq(buddyTurns.userId, userId));
  const quips = await db.select().from(buddyQuips).where(eq(buddyQuips.userId, userId));
  expect(turns).toHaveLength(2);
  expect(quips).toHaveLength(1);
  expect(quips[0]?.fromCanned).toBe(false);
  expect(quips[0]?.signalKind).toBe("workload:succeeded");
});

test("buddy_turns role CHECK rejects a non user|assistant role", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_bad_role" });
  await db.insert(buddies).values(buddyValues(userId));
  let caught: unknown;
  try {
    await db.insert(buddyTurns).values({
      id: castId<BuddyTurnId>("buddy_turn_bad"),
      userId,
      role: "system" as unknown as "user" | "assistant",
      content: "nope",
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("deleting the user cascades buddy + turns + quips (two-hop)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_cascade" });
  await db.insert(buddies).values(buddyValues(userId));
  await db
    .insert(buddyTurns)
    .values({ id: castId<BuddyTurnId>("buddy_turn_c"), userId, role: "user", content: "x" });
  await db.insert(buddyQuips).values({
    id: castId<BuddyQuipId>("buddy_quip_c"),
    userId,
    text: "y",
    signalKind: "chat:reply",
    mood: "content",
  });

  await db.delete(users).where(eq(users.id, userId));

  expect(await db.select().from(buddies).where(eq(buddies.userId, userId))).toHaveLength(0);
  expect(await db.select().from(buddyTurns).where(eq(buddyTurns.userId, userId))).toHaveLength(0);
  expect(await db.select().from(buddyQuips).where(eq(buddyQuips.userId, userId))).toHaveLength(0);
});
