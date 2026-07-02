// engine/select-speakers — the 7a DETERMINISTIC arbitration (chat.md Part III §6). Pure unit tests: same
// inputs + same injected PRNG → same order; ban-last-speaker (soft yield); talkativeness weighting; the
// forced/@mention hard override; solo = roster-of-1; the eligible-set predicates (muted/left excluded). D60:
// the speaker identity is a ref ({character}|{agent}) — an agent candidate is selectable (agent-principal/02).

import type { GroupConfig } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type {
  ArbiterCandidate,
  SpeakerRef,
} from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import { speakerKey } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
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
const uid = (k: string): UserId => castId<UserId>(`user_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const agentRef = (k: string): SpeakerRef => ({ kind: "agent", userId: uid(k) });
/** Extract the stable keys of a ref list (order-preserving) — the assertion surface for a mixed result. */
const keys = (refs: readonly SpeakerRef[]): string[] => refs.map(speakerKey);

function candidate(ref: SpeakerRef, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate {
  return {
    ref,
    talkativeness: over.talkativeness ?? 0.5,
    disabled: over.disabled ?? false,
    leftSeq: over.leftSeq ?? null,
  };
}
/** A character candidate keyed by short name (the common case). */
const cc = (k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate =>
  candidate(charRef(k), over);

const POLICIES: GroupConfig["policy"][] = ["natural", "list", "pooled", "manual", "smart"];

describe("selectSpeakers — determinism", () => {
  test("same inputs + same PRNG seed → identical order (natural)", () => {
    const candidates = [cc("a"), cc("b"), cc("c"), cc("d")];
    const run = (): SpeakerRef[] =>
      selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: seededRng(42) });
    expect(keys(run())).toEqual(keys(run()));
  });

  test("a different seed can produce a different order (the rng is the only entropy)", () => {
    const candidates = [cc("a"), cc("b"), cc("c"), cc("d")];
    const orderFor = (seed: number): string[] =>
      keys(
        selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: seededRng(seed) }),
      );
    // Across these seeds at least two distinct orders appear (the weighted sample actually samples).
    const orders = new Set([1, 2, 3, 4, 5].map((s) => orderFor(s).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });

  test("natural is a permutation of the eligible set (count preserved)", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    const out = selectSpeakers({
      candidates,
      policy: "natural",
      lastSpeaker: null,
      rng: seededRng(7),
    });
    const byStr = (a: string, b: string): number => a.localeCompare(b);
    expect([...keys(out)].sort(byStr)).toEqual(
      [charRef("a"), charRef("b"), charRef("c")].map(speakerKey).sort(byStr),
    );
  });
});

describe("selectSpeakers — talkativeness weighting", () => {
  test("a zero-talkativeness member always sorts behind a positive one (every seed)", () => {
    const candidates = [cc("quiet", { talkativeness: 0 }), cc("loud", { talkativeness: 0.5 })];
    for (let seed = 0; seed < 50; seed += 1) {
      const out = selectSpeakers({
        candidates,
        policy: "natural",
        lastSpeaker: null,
        rng: seededRng(seed),
      });
      expect(out[0]).toEqual(charRef("loud"));
    }
  });
});

describe("selectSpeakers — ban-last-speaker (soft)", () => {
  test("the last speaker is excluded when others remain (list, deterministic)", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: charRef("a"),
      rng: seededRng(1),
    });
    expect(keys(out)).not.toContain(speakerKey(charRef("a")));
    expect(keys(out)).toEqual(keys([charRef("b"), charRef("c")]));
  });

  test("soft yield: the sole eligible char re-speaks even when it IS the last speaker (solo)", () => {
    const candidates = [cc("solo")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: charRef("solo"),
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("solo")]));
  });

  test("ban-last works across kinds: an agent last-speaker is excluded when a character remains", () => {
    const candidates = [candidate(agentRef("buddy")), cc("a")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: agentRef("buddy"),
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });
});

describe("selectSpeakers — solo = roster-of-1 (no if(isGroup))", () => {
  test("every policy returns the single eligible character (forced-free)", () => {
    const candidates = [cc("only")];
    for (const policy of POLICIES) {
      const out = selectSpeakers({ candidates, policy, lastSpeaker: null, rng: seededRng(3) });
      // `manual` schedules no one without a forced target — the documented exception (computed, not a
      // conditional expect).
      const expected = policy === "manual" ? [] : keys([charRef("only")]);
      expect(keys(out)).toEqual(expected);
    }
  });
});

describe("selectSpeakers — AI-driven kinds: an agent is arbiter-selectable (D60)", () => {
  test("an agent candidate is selected exactly like a character (mixed roster, list order)", () => {
    const candidates = [cc("a"), candidate(agentRef("buddy")), cc("c")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: null,
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("a"), agentRef("buddy"), charRef("c")]));
    // The agent ref round-trips intact (userId preserved, no characterId).
    expect(out[1]).toEqual({ kind: "agent", userId: uid("buddy") });
  });

  test("a muted/left agent is never selected (the eligibility predicate is kind-blind)", () => {
    const candidates = [
      candidate(agentRef("muted"), { disabled: true }),
      candidate(agentRef("left"), { leftSeq: 5 }),
      cc("present"),
    ];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: null,
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("present")]));
  });
});

describe("selectSpeakers — forced / @mention hard override", () => {
  test("forced ids win before any policy AND bypass ban-last", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    const out = selectSpeakers({
      candidates,
      policy: "manual",
      lastSpeaker: charRef("b"),
      forcedIds: [cid("b")],
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("b")]));
  });

  test("forced ids are intersected with the eligible set (a muted/left forced target is dropped)", () => {
    const candidates = [cc("a"), cc("muted", { disabled: true })];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: null,
      forcedIds: [cid("muted"), cid("a")],
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });
});

describe("selectSpeakers — eligibility + manual + cap", () => {
  test("muted (disabled) + left (leftSeq) members are never selected", () => {
    const candidates = [cc("present"), cc("muted", { disabled: true }), cc("left", { leftSeq: 5 })];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: null,
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("present")]));
  });

  test("manual schedules no one without a forced target", () => {
    const candidates = [cc("a"), cc("b")];
    const out = selectSpeakers({
      candidates,
      policy: "manual",
      lastSpeaker: null,
      rng: seededRng(1),
    });
    expect(out).toEqual([]);
  });

  test("maxSpeakers truncates the ordered result", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    const out = selectSpeakers({
      candidates,
      policy: "list",
      lastSpeaker: null,
      rng: seededRng(1),
      maxSpeakers: 1,
    });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });
});

describe("resolveMentions — @mention extraction (human-authored text only)", () => {
  const cast = [
    { ref: charRef("aria"), name: "Aria" },
    { ref: charRef("ariastorm"), name: "Aria Stormborn" },
    { ref: charRef("bran"), name: "Bran" },
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

  test("an agent seat in the cast is never @mention-forceable (character-only, v1)", () => {
    const mixed = [...cast, { ref: agentRef("buddy"), name: "Buddy" }];
    expect(resolveMentions("hey @Buddy", mixed)).toEqual([]);
  });
});
