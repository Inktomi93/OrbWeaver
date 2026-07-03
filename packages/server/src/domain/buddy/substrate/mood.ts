// domain/buddy/substrate/mood — the PURE mood machine + the derived facets (bond tier, maturity stage,
// archetype form). All pure → unit-pinnable without a db. The READ-PATH facets (`decayMood`,
// `bondTierOf`, `stageOf`, `formOf`) are consumed NOW by `get`/`hatch`'s view projection; the
// REACTOR-FACING parts (`moodForSignal`/`resolveMood`/`statForSignal` + the signal maps) are consumed by
// the DEFERRED observer subsystem — kept here as the ONE home of the machine, with the exhaustiveness
// invariant (#8) enforced today by a unit test.
//
// §7.5 exhaustive-dispatch: `SIGNAL_MOOD` is a `Record<BuddySignalKind, Mood>` (full — a new signal kind
// fails `tsc`); `SIGNAL_STAT` is an INTENTIONAL `Partial<Record<…>>` (not every signal grows a stat),
// asserted on the consumer side.

import type {
  BondTier,
  CompanionForm,
  CompanionStats,
  Mood,
  Stage,
  StatName,
} from "@orb/contracts/buddy";
import { BOND_THRESHOLDS, FORMS, MOOD_PRIORITY, STAGE_THRESHOLDS } from "@orb/contracts/buddy";
import type { BuddySignalKind } from "../contract/signals";

const SIGNAL_MOOD: Record<BuddySignalKind, Mood> = {
  "workload:started": "working",
  "workload:completed": "excited",
  "workload:failed": "queasy",
  "chat:first-message": "curious",
  "chat:turn-completed": "content",
  "chat:turn-aborted": "playful",
  "trace:slow-turn": "queasy",
  "trace:error-spike": "anxious",
  "presence:idle": "sleepy",
  "presence:wake": "content",
  "presence:neglected": "grumpy",
  "buddy:evolved": "proud",
};

export function moodForSignal(kind: BuddySignalKind): Mood {
  return SIGNAL_MOOD[kind];
}

/** Lazy decay: a buddy quiet \>15min settles back to `content`. Applied at READ time (in `get`) so a
 *  quiet buddy drifts calm with no background write. */
export const MOOD_DECAY_MS = 900_000; // 15 minutes
export function decayMood(mood: Mood, lastReactionAt: number | null, now: number): Mood {
  if (lastReactionAt === null) {
    return mood;
  }
  return now - lastReactionAt > MOOD_DECAY_MS ? "content" : mood;
}

/** How long a higher-priority mood is protected from a lower-priority downgrade. */
export const MOOD_HOLD_MS = 120_000; // 2 minutes

/** Decide the mood to persist when `candidate` arrives over `current`. A higher-or-equal priority
 *  candidate always wins; a lower one is held off while the current mood is still fresh (a failure's
 *  `anxious` survives a routine `content` a moment later) and accepted once stale. */
export function resolveMood(
  current: Mood,
  candidate: Mood,
  lastReactionAt: number | null,
  now: number,
): Mood {
  if (lastReactionAt === null) {
    return candidate;
  }
  if (now - lastReactionAt > MOOD_DECAY_MS) {
    return candidate;
  }
  if (MOOD_PRIORITY[candidate] >= MOOD_PRIORITY[current]) {
    return candidate;
  }
  return now - lastReactionAt < MOOD_HOLD_MS ? current : candidate;
}

// Stat growth — the same signals nudge stats (small, clamped, throttled by the cooldown).
const SIGNAL_STAT: Partial<Record<BuddySignalKind, StatName>> = {
  "chat:first-message": "LORE",
  "chat:turn-completed": "WARMTH",
  "chat:turn-aborted": "MISCHIEF",
  "workload:completed": "FOCUS",
  "trace:slow-turn": "WIT",
};

export function statForSignal(kind: BuddySignalKind): StatName | null {
  return SIGNAL_STAT[kind] ?? null;
}

// --- Derived facets (relationship / maturity / archetype) --------------------

export function bondTierOf(bondXp: number): BondTier {
  if (bondXp >= BOND_THRESHOLDS.bestie) {
    return "bestie";
  }
  if (bondXp >= BOND_THRESHOLDS.friend) {
    return "friend";
  }
  if (bondXp >= BOND_THRESHOLDS.acquaintance) {
    return "acquaintance";
  }
  return "stranger";
}

/** Total of all five stats (0-500) — the maturity axis. */
function statSum(stats: CompanionStats): number {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}

export function stageOf(stats: CompanionStats): Stage {
  const sum = statSum(stats);
  if (sum >= STAGE_THRESHOLDS.stage2) {
    return 2;
  }
  if (sum >= STAGE_THRESHOLDS.stage1) {
    return 1;
  }
  return 0;
}

/** Archetype form from the dominant stat (ties broken by STAT_NAMES order). */
export function formOf(stats: CompanionStats): CompanionForm {
  let best: StatName | null = null;
  for (const [name, value] of Object.entries(stats) as [StatName, number][]) {
    if (best === null || value > stats[best]) {
      best = name;
    }
  }
  return FORMS[best ?? "WARMTH"];
}
