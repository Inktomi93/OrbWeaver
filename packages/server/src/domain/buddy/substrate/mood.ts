// domain/buddy/substrate/mood — the pure mood machine + derived facets (bond tier, maturity stage,
// archetype form). SIGNAL_MOOD is a full Record<BuddySignalKind, Mood> (a new signal kind fails tsc);
// SIGNAL_STAT is intentionally partial (not every signal grows a stat).

import type { BondTier, CompanionForm, CompanionStats, Mood, Stage, StatName } from "@orb/contracts/buddy";
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

/** Lazy decay: a buddy quiet \>15min settles back to content. Applied at read time, no background write. */
export const MOOD_DECAY_MS = 900_000;
export function decayMood(mood: Mood, lastReactionAt: number | null, now: number): Mood {
  if (lastReactionAt === null) {
    return mood;
  }
  return now - lastReactionAt > MOOD_DECAY_MS ? "content" : mood;
}

const MOOD_HOLD_MS = 120_000;

/** A higher-or-equal priority candidate always wins; a lower one is held off while current is fresh
 *  (a failure's anxious survives a routine content a moment later) and accepted once stale. */
export function resolveMood(current: Mood, candidate: Mood, lastReactionAt: number | null, now: number): Mood {
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

export function formOf(stats: CompanionStats): CompanionForm {
  let best: StatName | null = null;
  for (const [name, value] of Object.entries(stats) as [StatName, number][]) {
    if (best === null || value > stats[best]) {
      best = name;
    }
  }
  return FORMS[best ?? "WARMTH"];
}
