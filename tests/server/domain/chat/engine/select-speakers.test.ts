// engine/select-speakers — the 7a DETERMINISTIC arbitration (chat.md Part III §6). Pure unit tests: same
// inputs + same injected PRNG → same order; ban-last-speaker (soft yield); talkativeness weighting; the
// forced/@mention hard override; solo = roster-of-1; the eligible-set predicates (muted/left excluded).

import type { GroupConfig } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ArbiterCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import {
  resolveMentions,
  selectSpeakers,
} from "../../../../../packages/server/src/domain/chat/engine/select-speakers";
import { expect, test } from "../../../../support/fixtures";

/** A seeded Park-Miller (MINSTD) LCG — the INJECTED PRNG stand-in (D46; no `Math.random`, no bitwise). */
function seededRng(seed: number): () => number {
  let s = seed % 2_147_483_647;
  if (s <= 0) {
    s += 2_147_483_646;
  }
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);

function candidate(k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate {
  return {
    characterId: cid(k),
    talkativeness: over.talkativeness ?? 0.5,
    disabled: over.disabled ?? false,
    leftSeq: over.leftSeq ?? null,
  };
}

const POLICIES: GroupConfig["policy"][] = ["natural", "list", "pooled", "manual", "smart"];

describe("selectSpeakers — determinism", () => {
  test("same inputs + same PRNG seed → identical order (natural)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
    const run = (): CharacterId[] =>
      selectSpeakers({ candidates, policy: "natural", lastSpeakerId: null, rng: seededRng(42) });
    expect(run()).toEqual(run());
  });

  test("a different seed can produce a different order (the rng is the only entropy)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
    const orderFor = (seed: number): CharacterId[] =>
      selectSpeakers({ candidates, policy: "natural", lastSpeakerId: null, rng: seededRng(seed) });
    // Across these seeds at least two distinct orders appear (the weighted sample actually samples).
    const orders = new Set([1, 2, 3, 4, 5].map((s) => orderFor(s).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });

  test("natural is a permutation of the eligible set (count preserved)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = selectSpeakers({
      candidates,
      policy: "natural",
      lastSpeakerId: null,
      rng: seededRng(7),
    });
    expect([...out].sort()).toEqual([cid("a"), cid("b"), cid("c")].sort());
  });
});

describe("selectSpeakers — talkativeness weighting", () => {
  test("a zero-talkativeness member always sorts behind a positive one (every seed)", () => {
    const candidates = [
      candidate("quiet", { talkativeness: 0 }),
      candidate("loud", { talkativeness: 0.5 }),
    ];
    for (let seed = 0; seed < 50; seed += 1) {
      const out = selectSpeakers({
        candidates,
        policy: "natural",
        lastSpeakerId: null,
        rng: seededRng(seed),
      });
      expect(out[0]).toBe(cid("loud"));
    }
  });
});

describe("selectSpeakers — ban-last-speaker (soft)", () => {
  test("the last speaker is excluded when others remain (list, deterministic)", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeakerId: cid("a"),
      rng: seededRng(1),
    });
    expect(out).not.toContain(cid("a"));
    expect(out).toEqual([cid("b"), cid("c")]);
  });

  test("soft yield: the sole eligible char re-speaks even when it IS the last speaker (solo)", () => {
    const candidates = [candidate("solo")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeakerId: cid("solo"),
      rng: seededRng(1),
    });
    expect(out).toEqual([cid("solo")]);
  });
});

describe("selectSpeakers — solo = roster-of-1 (no if(isGroup))", () => {
  test("every policy returns the single eligible character (forced-free)", () => {
    const candidates = [candidate("only")];
    for (const policy of POLICIES) {
      const out = selectSpeakers({ candidates, policy, lastSpeakerId: null, rng: seededRng(3) });
      // `manual` schedules no one without a forced target — the documented exception (computed, not a
      // conditional expect).
      const expected = policy === "manual" ? [] : [cid("only")];
      expect(out).toEqual(expected);
    }
  });
});

describe("selectSpeakers — forced / @mention hard override", () => {
  test("forced ids win before any policy AND bypass ban-last", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = selectSpeakers({
      candidates,
      policy: "manual",
      lastSpeakerId: cid("b"),
      forcedIds: [cid("b")],
      rng: seededRng(1),
    });
    expect(out).toEqual([cid("b")]);
  });

  test("forced ids are intersected with the eligible set (a muted/left forced target is dropped)", () => {
    const candidates = [candidate("a"), candidate("muted", { disabled: true })];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeakerId: null,
      forcedIds: [cid("muted"), cid("a")],
      rng: seededRng(1),
    });
    expect(out).toEqual([cid("a")]);
  });
});

describe("selectSpeakers — eligibility + manual + cap", () => {
  test("muted (disabled) + left (leftSeq) members are never selected", () => {
    const candidates = [
      candidate("present"),
      candidate("muted", { disabled: true }),
      candidate("left", { leftSeq: 5 }),
    ];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeakerId: null,
      rng: seededRng(1),
    });
    expect(out).toEqual([cid("present")]);
  });

  test("manual schedules no one without a forced target", () => {
    const candidates = [candidate("a"), candidate("b")];
    const out = selectSpeakers({
      candidates,
      policy: "manual",
      lastSpeakerId: null,
      rng: seededRng(1),
    });
    expect(out).toEqual([]);
  });

  test("maxSpeakers truncates the ordered result", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeakerId: null,
      rng: seededRng(1),
      maxSpeakers: 1,
    });
    expect(out).toEqual([cid("a")]);
  });
});

describe("resolveMentions — @mention extraction (human-authored text only)", () => {
  const cast = [
    { characterId: cid("aria"), name: "Aria" },
    { characterId: cid("ariastorm"), name: "Aria Stormborn" },
    { characterId: cid("bran"), name: "Bran" },
  ];

  test("extracts @mentions in first-appearance order", () => {
    expect(resolveMentions("hey @Bran and @Aria", cast)).toEqual([cid("bran"), cid("aria")]);
  });

  test("longest-name-first: @Aria Stormborn matches the longer name, not @Aria", () => {
    expect(resolveMentions("@Aria Stormborn, attack!", cast)).toEqual([cid("ariastorm")]);
  });

  test("case-insensitive; no @ → nothing", () => {
    expect(resolveMentions("@aria", cast)).toEqual([cid("aria")]);
    expect(resolveMentions("Aria without an at-sign", cast)).toEqual([]);
  });

  test("empty text / empty cast → no mentions", () => {
    expect(resolveMentions("", cast)).toEqual([]);
    expect(resolveMentions("@Aria", [])).toEqual([]);
  });
});
