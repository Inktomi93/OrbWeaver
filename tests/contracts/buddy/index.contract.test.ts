import type { CompanionBones, CompanionStats } from "@orb/contracts/buddy";
import {
  BOND_THRESHOLDS,
  BOND_TIERS,
  bondTierSchema,
  companionBonesSchema,
  companionStatsSchema,
  EYES,
  eyeSchema,
  FORMS,
  HATS,
  hatSchema,
  MOOD_PRIORITY,
  MOODS,
  moodSchema,
  RARITIES,
  RARITY_FLOOR,
  RARITY_STARS,
  RARITY_WEIGHTS,
  raritySchema,
  SPECIES,
  STAT_NAMES,
  speciesSchema,
  statNameSchema,
} from "@orb/contracts/buddy";
import { expect, test } from "../../support/fixtures";

// ── The string axes: each `z.enum(TUPLE)` parses every member, rejects a non-member, round-trips. ──
const ENUM_AXES = [
  { name: "rarity", schema: raritySchema, members: RARITIES },
  { name: "species", schema: speciesSchema, members: SPECIES },
  { name: "eye", schema: eyeSchema, members: EYES },
  { name: "hat", schema: hatSchema, members: HATS },
  { name: "statName", schema: statNameSchema, members: STAT_NAMES },
  { name: "mood", schema: moodSchema, members: MOODS },
  { name: "bondTier", schema: bondTierSchema, members: BOND_TIERS },
] as const;

for (const axis of ENUM_AXES) {
  test(`${axis.name}Schema parses + round-trips every canonical member`, () => {
    for (const member of axis.members) {
      expect(axis.schema.parse(member)).toBe(member);
    }
  });

  test(`${axis.name}Schema rejects a non-member`, () => {
    expect(axis.schema.safeParse("not-a-real-member").success).toBe(false);
  });
}

// ── Tuple-membership pins (the test-mirror surrogate). `@orb/db` derives its enum columns from these
// tuples; pinning the member sets here is the guarantee a db enum-column change can't silently drift. ──
test("the canonical tuples pin their exact member sets", () => {
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
  expect([...STAT_NAMES]).toEqual(["LORE", "WIT", "WARMTH", "MISCHIEF", "FOCUS"]);
  expect([...BOND_TIERS]).toEqual(["stranger", "acquaintance", "friend", "bestie"]);
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
});

// ── The weight/threshold maps are exhaustive over their axes (a missing key is a compile error via
// `Record<K, …>`; this asserts at runtime that every member has an entry — drift backstop). ──
test("the rarity/mood/bond maps cover every axis member", () => {
  for (const r of RARITIES) {
    expect(RARITY_WEIGHTS[r]).toBeTypeOf("number");
    expect(RARITY_FLOOR[r]).toBeTypeOf("number");
    expect(RARITY_STARS[r]).toBeTypeOf("string");
  }
  for (const m of MOODS) {
    expect(MOOD_PRIORITY[m]).toBeTypeOf("number");
  }
  for (const t of BOND_TIERS) {
    expect(BOND_THRESHOLDS[t]).toBeTypeOf("number");
  }
  for (const s of STAT_NAMES) {
    expect(FORMS[s].title).toBeTypeOf("string");
  }
});

// ── CompanionStats shape pin: the schema is exhaustive over `StatName` and bounds each value to 1–100. ──
// biome-ignore-start lint/style/useNamingConvention: the keys ARE the `STAT_NAMES` axis (CONSTANT_CASE).
const SAMPLE_STATS: CompanionStats = {
  LORE: 80,
  WIT: 42,
  WARMTH: 17,
  MISCHIEF: 55,
  FOCUS: 33,
};
// biome-ignore-end lint/style/useNamingConvention: end the SAMPLE_STATS fixture.

test("companionStatsSchema parses a full stat block and round-trips", () => {
  expect(companionStatsSchema.parse(SAMPLE_STATS)).toEqual(SAMPLE_STATS);
});

test("companionStatsSchema rejects an out-of-range stat", () => {
  const aboveMax = { ...SAMPLE_STATS, [STAT_NAMES[0]]: 101 };
  const belowMin = { ...SAMPLE_STATS, [STAT_NAMES[0]]: 0 };
  expect(companionStatsSchema.safeParse(aboveMax).success).toBe(false);
  expect(companionStatsSchema.safeParse(belowMin).success).toBe(false);
});

// ── CompanionBones shape pin: the gacha-body schema validates a full bones row and round-trips. ──
const SAMPLE_BONES: CompanionBones = {
  rarity: "legendary",
  species: "wisp",
  eye: "✦",
  hat: "crown",
  shiny: true,
  stats: SAMPLE_STATS,
};

test("companionBonesSchema parses a full bones snapshot and round-trips", () => {
  expect(companionBonesSchema.parse(SAMPLE_BONES)).toEqual(SAMPLE_BONES);
});

test("companionBonesSchema rejects bones carrying a non-member enum value", () => {
  expect(companionBonesSchema.safeParse({ ...SAMPLE_BONES, rarity: "mythic" }).success).toBe(false);
  expect(companionBonesSchema.safeParse({ ...SAMPLE_BONES, hat: "fedora" }).success).toBe(false);
});
