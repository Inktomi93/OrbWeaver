// `@orb/contracts/buddy` — the companion (Tamagotchi buddy) TAXONOMY vocabulary. DAG root: kit-free,
// `zod` only. This is the ONE cross-boundary home for the buddy's gacha vocabulary: `@orb/db` imports
// the tuples for its enum columns (`buddies.rarity/species/hat/mood`), `domain/buddy` rolls + reacts
// against them, and `@orb/client` renders sprites from them — all import from HERE, never re-exported
// through `@orb/server` (buddy.md invariant #7; shared-dissolution.md §4).
//
// §7.5 tuple→derived-union discipline: every string axis is an `as const` TUPLE (the one importable
// canonical home — `no-inline-union-redecl`), its `type` is `(typeof TUPLE)[number]`, and the wire
// `z.enum(TUPLE)` schema imports the tuple. The db enum columns DERIVE from these tuples (test-mirror).
//
// Ported from neo-tavern `shared/buddy/taxonomy.ts`. NOT ported: `sprites.ts` (renderSprite/renderFace
// + the body/hat/mood art) — that is `@orb/client` presentation (shared-dissolution.md §10), and it
// imports these taxonomy types DOWN from contracts.

import { z } from "zod";

// ── Rarity ────────────────────────────────────────────────────────────────────
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

/** Unwired display intent (no current consumer) — KEEP (`structure.md` "unwired ≠ worthless").
 *  A rarity→stars map; travels with the taxonomy (buddy.md "Esoteric / load-bearing"). */
export const RARITY_STARS: Record<Rarity, string> = {
  common: "★",
  uncommon: "★★",
  rare: "★★★",
  epic: "★★★★",
  legendary: "★★★★★",
};

// ── Species ─────────────────────────────────────────────────────────────────────
export const SPECIES = ["mote", "scribe", "ember", "loom", "pixel", "wisp"] as const;
export type Species = (typeof SPECIES)[number];
export const speciesSchema = z.enum(SPECIES);

// ── Eye (a typed-text column in db, not an enum, but a closed taxonomy axis here) ─
export const EYES = ["●", "•", "◉", "✦", "°", "×"] as const;
export type Eye = (typeof EYES)[number];
export const eyeSchema = z.enum(EYES);

// ── Hat ──────────────────────────────────────────────────────────────────────────
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

// ── Stats ──────────────────────────────────────────────────────────────────────
/** Tavern-flavoured disposition stats (1–100). One peaks, one dumps, the rest scatter. */
export const STAT_NAMES = ["LORE", "WIT", "WARMTH", "MISCHIEF", "FOCUS"] as const;
export type StatName = (typeof STAT_NAMES)[number];
export const statNameSchema = z.enum(STAT_NAMES);

const STAT_MIN = 1;
const STAT_MAX = 100;
/** Exhaustive over `StatName` (zod 4 `z.record` of an enum key → full, non-partial `Record`). */
export const companionStatsSchema = z.record(
  statNameSchema,
  z.number().int().min(STAT_MIN).max(STAT_MAX),
);
export type CompanionStats = z.infer<typeof companionStatsSchema>;

// ── Mood ─────────────────────────────────────────────────────────────────────────
// The expressive mood set. The sprite (client) shows eyes+mouth per mood; the reactor (domain) maps each
// signal to one of these and resolves conflicts by `MOOD_PRIORITY`.
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

// ── Relationship (bond) tier ─────────────────────────────────────────────────────
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

// ── Maturity (stage) — DERIVED from the sum of stats; never stored (buddy.md). ───
export type Stage = 0 | 1 | 2;
/** Lower bound of total stat-sum (max 500) for stages 1 and 2. Below `stage1` = stage 0. */
export const STAGE_THRESHOLDS = { stage1: 200, stage2: 350 } as const;

// ── Form (archetype) — the dominant stat picks a title + persona blurb (flavors prompts/UI). ──
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

// ── Bones — the deterministic gacha body (rolled from the user id at hatch, then snapshotted to the
// `buddies` row; MUTABLE thereafter as stats grow). The schema is the one home; the type is inferred. ──
export const companionBonesSchema = z.object({
  rarity: raritySchema,
  species: speciesSchema,
  eye: eyeSchema,
  hat: hatSchema,
  shiny: z.boolean(),
  stats: companionStatsSchema,
});
export type CompanionBones = z.infer<typeof companionBonesSchema>;
