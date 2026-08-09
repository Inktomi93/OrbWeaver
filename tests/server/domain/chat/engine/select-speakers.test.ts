// engine/select-speakers — the 7a DETERMINISTIC arbitration (chat.md Part III §6). Pure unit tests: same
// inputs + same injected PRNG → same order; ban-last-speaker (soft yield); talkativeness weighting; the
// forced/@mention hard override; solo = roster-of-1; the eligible-set predicates (muted/left excluded).

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ArbiterCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { resolveMentions, selectSpeakers } from "../../../../../packages/server/src/domain/chat/engine/select-speakers.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
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
const cc = (k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate => candidate(charRef(k), over);

const POLICIES: GroupConfig["policy"][] = ["natural", "list", "pooled", "manual", "smart"];

describe("selectSpeakers — determinism", () => {
  test("same inputs + same PRNG seed → identical order (natural)", () => {
    const candidates = [cc("a"), cc("b"), cc("c"), cc("d")];
    const run = (): SpeakerRef[] => selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: seededRng(42) });
    expect(keys(run())).toEqual(keys(run()));
  });

  test("a different seed can produce a different order (the rng is the only entropy)", () => {
    const candidates = [cc("a"), cc("b"), cc("c"), cc("d")];
    const orderFor = (seed: number): string[] => keys(selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: seededRng(seed) }));
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
    expect(keys(out).toSorted(byStr)).toEqual([charRef("a"), charRef("b"), charRef("c")].map(speakerKey).sort(byStr));
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

// `pooled` is the ROTATION policy the UI sells as "Round-robin" — it must differ from `list` (roster order,
// all). The distinguishing surface is a CAPPED chain (auto-mode drives `maxSpeakers: 1`): pooled visits every
// member before repeating one; list ping-pongs between the first two and starves the rest.
describe("selectSpeakers — pooled (round-robin: least-recently-spoken first)", () => {
  /** Walk N capped rounds, feeding each round's pick back as the next `lastSpeaker` (the auto-chain's shape). */
  function chain(policy: GroupConfig["policy"], candidates: readonly ArbiterCandidate[], rounds: number): string[] {
    const rng = seededRng(1);
    const visited: string[] = [];
    let last: SpeakerRef | null = null;
    for (let i = 0; i < rounds; i += 1) {
      const next: SpeakerRef | undefined = selectSpeakers({ candidates, policy, lastSpeaker: last, rng, maxSpeakers: 1 })[0];
      if (next === undefined) {
        return visited;
      }
      visited.push(speakerKey(next));
      last = next;
    }
    return visited;
  }

  test("STARVATION: a capped pooled chain visits EVERY member before repeating one", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    expect(chain("pooled", candidates, 6)).toEqual(keys([charRef("a"), charRef("b"), charRef("c"), charRef("a"), charRef("b"), charRef("c")]));
  });

  test("`list` is NOT a rotation — it stays roster order and starves the tail (the two policies differ)", () => {
    const candidates = [cc("a"), cc("b"), cc("c")];
    // ban-last alone only alternates the first two: `c` never speaks under a capped `list` chain.
    expect(chain("list", candidates, 4)).toEqual(keys([charRef("a"), charRef("b"), charRef("a"), charRef("b")]));
  });

  test("uncapped pooled orders the WHOLE pool least-recently-spoken first (rotated past the last speaker)", () => {
    const out = selectSpeakers({
      candidates: [cc("a"), cc("b"), cc("c"), cc("d")],
      policy: "pooled",
      lastSpeaker: charRef("b"),
      rng: seededRng(1),
    });
    // `b` is ban-last-dropped; the rotation starts at the roster slot AFTER it, wrapping to `a` last.
    expect(keys(out)).toEqual(keys([charRef("c"), charRef("d"), charRef("a")]));
  });

  // `banLast:false` (the room's `allowSelfResponses`) lifts the ELIGIBILITY ban only. The rotation origin is
  // the same `lastSpeaker` value, so a capped chain still visits every seat — it just may re-pick the last
  // speaker when the rotation comes back around to him.
  test("banLast:false keeps the rotation (the last speaker rejoins the pool, at the END of the cycle)", () => {
    const out = selectSpeakers({
      candidates: [cc("a"), cc("b"), cc("c")],
      policy: "pooled",
      lastSpeaker: charRef("b"),
      banLast: false,
      rng: seededRng(1),
    });
    // `b` is no longer dropped, but the order still starts at the seat AFTER him and wraps to him last.
    expect(keys(out)).toEqual(keys([charRef("c"), charRef("a"), charRef("b")]));
  });

  test("a last speaker who is no longer eligible (left/muted) leaves roster order untouched", () => {
    const out = selectSpeakers({
      candidates: [cc("a"), cc("b"), cc("gone", { leftSeq: 3 })],
      policy: "pooled",
      lastSpeaker: charRef("gone"),
      rng: seededRng(1),
    });
    expect(keys(out)).toEqual(keys([charRef("a"), charRef("b")]));
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

  // FIRST-OCCURRENCE MASKING: a shorter name whose FIRST occurrence sits inside a longer name's consumed
  // span must still fire on a LATER standalone occurrence — the human typed `@Aria` on purpose.
  test("a later standalone @Aria still forces her, even after @Aria Stormborn consumed the first hit", () => {
    expect(resolveMentions("@Aria Stormborn opens the door… @Aria, what do you think?", cast)).toEqual([cid("ariastorm"), cid("aria")]);
  });

  test("the nested-only case is unchanged: @Aria Stormborn alone forces ONLY the longer name", () => {
    expect(resolveMentions("@Aria Stormborn opens the door.", cast)).toEqual([cid("ariastorm")]);
  });

  // The masking unit is the NAME, not the ONE span that name happened to claim. A human who emphasises a
  // character by naming her twice left the second occurrence unmasked, so the nested shorter name matched
  // INSIDE it and a second, never-named character was forced into the round (and in a narrator room that
  // forced override also coerces the round to per-speaker — a round the host never asked for).
  test("a REPEATED @Aria Stormborn never leaks the nested @Aria (masking is per-NAME, not per-span)", () => {
    expect(resolveMentions("@Aria Stormborn opens the door… @Aria Stormborn kicks it shut.", cast)).toEqual([cid("ariastorm")]);
  });

  test("empty text / empty cast → no mentions", () => {
    expect(resolveMentions("", cast)).toEqual([]);
    expect(resolveMentions("@Aria", [])).toEqual([]);
  });
});
