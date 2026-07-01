// biome-ignore-all lint/style/useNamingConvention: the disposition-stat axis (STAT_NAMES) is
// CONSTANT_CASE — the @orb/contracts/buddy one home; this test exercises it with literal stat keys.
//
// mood — the pure mood machine + derived facets. Pins: the §7.5/invariant-#8 exhaustiveness (every
// BuddySignalKind maps to a mood), lazy read-time decay, the priority/hold resolution, and the
// bond/stage/form derivations. (substrate + the internal signals union are flat/domain-internal — deep
// relative imports, not the @orb front door which only exposes directory public surface.)

import type { CompanionStats } from "@orb/contracts/buddy";
import { MOODS } from "@orb/contracts/buddy";
import { describe } from "vitest";
import type { BuddySignalKind } from "../../../../../packages/server/src/domain/buddy/contract/signals.ts";
import {
  bondTierOf,
  decayMood,
  formOf,
  MOOD_DECAY_MS,
  moodForSignal,
  resolveMood,
  stageOf,
  statForSignal,
} from "../../../../../packages/server/src/domain/buddy/substrate/mood.ts";
import { expect, test } from "../../../../support/fixtures";

const ALL_SIGNALS: readonly BuddySignalKind[] = [
  "workload:started",
  "workload:completed",
  "workload:failed",
  "chat:first-message",
  "chat:turn-completed",
  "chat:turn-aborted",
  "trace:slow-turn",
  "trace:error-spike",
  "presence:idle",
  "presence:wake",
  "presence:neglected",
  "buddy:evolved",
];

const stats = (over: Partial<CompanionStats> = {}): CompanionStats => ({
  LORE: 10,
  WIT: 10,
  WARMTH: 10,
  MISCHIEF: 10,
  FOCUS: 10,
  ...over,
});

describe("mood machine — exhaustiveness (invariant #8)", () => {
  test("every BuddySignalKind maps to a real mood", () => {
    for (const kind of ALL_SIGNALS) {
      expect(MOODS).toContain(moodForSignal(kind));
    }
  });

  test("statForSignal is a partial map (some signals grow a stat, others null)", () => {
    expect(statForSignal("chat:first-message")).toBe("LORE");
    expect(statForSignal("presence:idle")).toBeNull();
  });
});

describe("decayMood (lazy read-time decay)", () => {
  test("never reacted (null) → mood is unchanged", () => {
    expect(decayMood("anxious", null, 1000)).toBe("anxious");
  });

  test("within the decay window → mood holds", () => {
    expect(decayMood("excited", 1000, 1000 + MOOD_DECAY_MS - 1)).toBe("excited");
  });

  test("past the decay window → settles to content", () => {
    expect(decayMood("excited", 1000, 1000 + MOOD_DECAY_MS + 1)).toBe("content");
  });
});

describe("resolveMood (priority + hold window)", () => {
  test("first reaction (null) always takes the candidate", () => {
    expect(resolveMood("content", "anxious", null, 5000)).toBe("anxious");
  });

  test("a higher-priority candidate displaces a fresh current", () => {
    expect(resolveMood("content", "anxious", 5000, 5500)).toBe("anxious");
  });

  test("a lower-priority candidate is held off while the current mood is fresh", () => {
    expect(resolveMood("anxious", "content", 5000, 5500)).toBe("anxious");
  });

  test("a stale current mood yields to any candidate", () => {
    expect(resolveMood("anxious", "content", 5000, 5000 + MOOD_DECAY_MS + 1)).toBe("content");
  });
});

describe("derived facets", () => {
  test("bondTierOf walks the thresholds", () => {
    expect(bondTierOf(0)).toBe("stranger");
    expect(bondTierOf(10)).toBe("acquaintance");
    expect(bondTierOf(50)).toBe("friend");
    expect(bondTierOf(200)).toBe("bestie");
  });

  test("stageOf is driven by the stat-sum", () => {
    expect(stageOf(stats())).toBe(0); // sum 50
    expect(stageOf(stats({ LORE: 100, WIT: 100, WARMTH: 100, MISCHIEF: 50 }))).toBe(2); // sum 370
  });

  test("formOf picks the dominant stat's archetype", () => {
    expect(formOf(stats({ MISCHIEF: 99 })).title).toBe("Trickster");
    expect(formOf(stats({ LORE: 99 })).title).toBe("Scholar");
  });
});
