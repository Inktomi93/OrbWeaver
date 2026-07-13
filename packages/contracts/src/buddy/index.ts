// `@orb/contracts/buddy` — the companion (Tamagotchi buddy) TAXONOMY vocabulary. The one cross-boundary
// home for the buddy's gacha vocabulary: `@orb/db` derives its enum columns from these tuples,
// `domain/buddy` rolls + reacts against them, `@orb/client` renders sprites from them.

import { z } from "zod";

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];
export const raritySchema = z.enum(RARITIES);

/** Weighted draw — the 60/25/10/4/1 curve (legendary ~1%). Keyed by the canonical `Rarity` axis. */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

/** Stat floor by rarity — a legendary can't roll a dud stat block. */
export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

/** Unwired display intent (no current consumer) — a rarity→stars map; travels with the taxonomy. */
export const RARITY_STARS: Record<Rarity, string> = {
  common: "★",
  uncommon: "★★",
  rare: "★★★",
  epic: "★★★★",
  legendary: "★★★★★",
};

export const SPECIES = ["mote", "scribe", "ember", "loom", "pixel", "wisp"] as const;
export type Species = (typeof SPECIES)[number];
export const speciesSchema = z.enum(SPECIES);

export const EYES = ["●", "•", "◉", "✦", "°", "×"] as const;
export type Eye = (typeof EYES)[number];
export const eyeSchema = z.enum(EYES);

export const HATS = [
  "none",
  "crown",
  "tophat",
  "antenna",
  "halo",
  "wizard",
  "beanie",
  "bow",
] as const;
export type Hat = (typeof HATS)[number];
export const hatSchema = z.enum(HATS);

/** Tavern-flavoured disposition stats (1–100). One peaks, one dumps, the rest scatter. */
export const STAT_NAMES = ["LORE", "WIT", "WARMTH", "MISCHIEF", "FOCUS"] as const;
export type StatName = (typeof STAT_NAMES)[number];
export const statNameSchema = z.enum(STAT_NAMES);

/** The per-stat clamp bounds (1–100). Exported so the reactor's stat nudge (domain/buddy/observer) clamps
 *  to the SAME range the schema validates — one home for the axis. */
export const STAT_MIN = 1;
export const STAT_MAX = 100;
/** Exhaustive over `StatName` (zod 4 `z.record` of an enum key → full, non-partial `Record`). */
export const companionStatsSchema = z.record(
  statNameSchema,
  z.number().int().min(STAT_MIN).max(STAT_MAX),
);
export type CompanionStats = z.infer<typeof companionStatsSchema>;

// The reactor (domain) maps each signal to one of these moods and resolves conflicts by `MOOD_PRIORITY`.
export const MOODS = [
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
] as const;
export type Mood = (typeof MOODS)[number];
export const moodSchema = z.enum(MOODS);

/** Mood priority — higher is "stickier". A reaction won't downgrade to a lower-priority mood inside the
 *  hold window (a failure's `anxious` survives a routine `content` a moment later). Exhaustive over `Mood`. */
export const MOOD_PRIORITY: Record<Mood, number> = {
  anxious: 5,
  queasy: 4,
  proud: 4,
  excited: 3,
  playful: 3,
  curious: 2,
  working: 2,
  grumpy: 2,
  content: 1,
  sleepy: 1,
};

export const BOND_TIERS = ["stranger", "acquaintance", "friend", "bestie"] as const;
export type BondTier = (typeof BOND_TIERS)[number];
export const bondTierSchema = z.enum(BOND_TIERS);

/** Lower bound of bondXp for each tier (ascending). `bondTierOf` (domain) walks these. */
export const BOND_THRESHOLDS: Record<BondTier, number> = {
  stranger: 0,
  acquaintance: 10,
  friend: 50,
  bestie: 200,
};

// Maturity (stage) — derived from the sum of stats; never stored.
export type Stage = 0 | 1 | 2;
/** Lower bound of total stat-sum (max 500) for stages 1 and 2. Below `stage1` = stage 0. */
export const STAGE_THRESHOLDS = { stage1: 200, stage2: 350 } as const;

export interface CompanionForm {
  title: string;
  blurb: string;
}
// biome-ignore-start lint/style/useNamingConvention: the keys ARE the `STAT_NAMES` axis members
// (CONSTANT_CASE by domain convention); this map is keyed by the dominant stat (`formOf` in domain).
export const FORMS: Record<StatName, CompanionForm> = {
  LORE: { title: "Scholar", blurb: "bookish and a little pedantic, delighted by detail" },
  WIT: { title: "Wit", blurb: "quick-tongued and dry, never misses a setup" },
  WARMTH: { title: "Warden", blurb: "steady and kind, looks out for you" },
  MISCHIEF: { title: "Trickster", blurb: "gleeful chaos gremlin, pokes at everything" },
  FOCUS: { title: "Sage", blurb: "calm and exacting, breathes in long timescales" },
};
// biome-ignore-end lint/style/useNamingConvention: end the `STAT_NAMES`-keyed FORMS map.

// The deterministic gacha body, rolled from the user id at hatch, then snapshotted to the `buddies`
// row (mutable thereafter as stats grow).
export const companionBonesSchema = z.object({
  rarity: raritySchema,
  species: speciesSchema,
  eye: eyeSchema,
  hat: hatSchema,
  shiny: z.boolean(),
  stats: companionStatsSchema,
});
export type CompanionBones = z.infer<typeof companionBonesSchema>;
