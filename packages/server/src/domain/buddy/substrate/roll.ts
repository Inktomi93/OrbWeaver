// biome-ignore-all lint/suspicious/noBitwiseOperators: mulberry32 + FNV-1a are byte-defined PRNG/hash
// codecs — the ops ARE the algorithm; rewriting them re-rolls every user's preview.
// domain/buddy/substrate/roll — the deterministic gacha: a user's bones are a pure function of their id
// (+ SALT). The SALT + the frozen draw order (rarity → species → eye → hat → shiny → stats) must never
// change once buddies exist — either would re-roll every user's preview. A golden test pins roll(knownId).

import type { CompanionBones, CompanionStats, Rarity } from "@orb/contracts/buddy";
import {
  EYES,
  HATS,
  RARITIES,
  RARITY_FLOOR,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
} from "@orb/contracts/buddy";
import type { UserId } from "@orb/kit/ids";

const SALT = "tavern-buddy-2026-01";

const MULBERRY_INC = 0x6d_2b_79_f5;
const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const U32 = 4_294_967_296;
const SHINY_CHANCE = 0.01;
const STAT_CAP = 100;
const STAT_MIN = 1;
const PEAK_BONUS = 50;
const PEAK_SPREAD = 30;
const DUMP_PENALTY = 10;
const DUMP_SPREAD = 15;
const MID_SPREAD = 40;
const INSPIRATION_RANGE = 1e9;

/** Mulberry32 — tiny seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0;
    a = (a + MULBERRY_INC) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / U32;
  };
}

/** FNV-1a 32-bit. */
function hashString(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const rarity of RARITIES) {
    r -= RARITY_WEIGHTS[rarity];
    if (r < 0) {
      return rarity;
    }
  }
  return "common";
}

/** One peak stat, one dump stat, the rest scattered; rarity raises the floor. */
function rollStats(rng: () => number, rarity: Rarity): CompanionStats {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) {
    dump = pick(rng, STAT_NAMES);
  }
  const stats = {} as Record<(typeof STAT_NAMES)[number], number>;
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(STAT_CAP, floor + PEAK_BONUS + Math.floor(rng() * PEAK_SPREAD));
    } else if (name === dump) {
      stats[name] = Math.max(STAT_MIN, floor - DUMP_PENALTY + Math.floor(rng() * DUMP_SPREAD));
    } else {
      stats[name] = floor + Math.floor(rng() * MID_SPREAD);
    }
  }
  return stats;
}

interface Roll {
  readonly bones: CompanionBones;
  readonly inspirationSeed: number;
}

function rollFrom(rng: () => number): Roll {
  const rarity = rollRarity(rng);
  const bones: CompanionBones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === "common" ? "none" : pick(rng, HATS),
    shiny: rng() < SHINY_CHANCE,
    stats: rollStats(rng, rarity),
  };
  return { bones, inspirationSeed: Math.floor(rng() * INSPIRATION_RANGE) };
}

export function roll(userId: UserId): Roll {
  return rollFrom(mulberry32(hashString(userId + SALT)));
}
