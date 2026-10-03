// engine/select-speakers — the 7a DETERMINISTIC arbitration (the chat design doc Part III §6). Pure unit tests: same
// inputs + same injected PRNG → same order; ban-last-speaker (soft yield); talkativeness weighting; the
// forced/@mention hard override; solo = roster-of-1; the eligible-set predicates (muted/left excluded).

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ArbiterCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { NAME_STOPWORDS, resolveMentions, resolveNameMentions, selectSpeakers } from "../../../../../packages/server/src/domain/chat/engine/select-speakers.ts";
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
});

/** A scripted PRNG: returns `draws` in order, so a test names every random decision. `natural` draws one shuffle
 *  key per pool member (lowest key walks first), then one roll per member in that shuffled walk, then — only
 *  when nobody was activated — one fallback pick. Running past the script is a test bug, so it throws. */
function scripted(...draws: number[]): () => number {
  let i = 0;
  return (): number => {
    const next = draws[i];
    if (next === undefined) {
      throw new Error(`scripted rng exhausted after ${draws.length} draws`);
    }
    i += 1;
    return next;
  };
}

/** Shuffle keys that keep roster order (the first member walks first). */
const IN_ORDER = [0.1, 0.2, 0.3] as const;
/** Rolls no 0.5-talkativeness member passes. */
const ALL_FAIL = [0.9, 0.9, 0.9] as const;

describe("selectSpeakers — natural activation (mentions, talkativeness rolls, one-random fallback)", () => {
  const trio = [cc("a"), cc("b"), cc("c")];

  test("a member speaks only when its roll is at or under its talkativeness — not every member, every round", () => {
    // a: 0.5 >= 0.4 passes · b: 0.5 >= 0.6 fails · c: 0.5 >= 0.5 passes (the boundary counts).
    const out = selectSpeakers({ candidates: trio, policy: "natural", lastSpeaker: null, rng: scripted(...IN_ORDER, 0.4, 0.6, 0.5) });
    expect(keys(out)).toEqual(keys([charRef("a"), charRef("c")]));
  });

  test("the rolled speakers reply in the shuffled walk's order, not roster order", () => {
    // Keys put b first, then c, then a; every roll passes.
    const out = selectSpeakers({ candidates: trio, policy: "natural", lastSpeaker: null, rng: scripted(0.3, 0.1, 0.2, 0, 0, 0) });
    expect(keys(out)).toEqual(keys([charRef("b"), charRef("c"), charRef("a")]));
  });

  test("a member named in the human's message speaks even when its roll fails, and named members go first", () => {
    const out = selectSpeakers({
      candidates: trio,
      policy: "natural",
      lastSpeaker: null,
      mentionedIds: [cid("c")],
      // a passes its roll, b and c fail theirs.
      rng: scripted(...IN_ORDER, 0.1, 0.9, 0.9),
    });
    expect(keys(out)).toEqual(keys([charRef("c"), charRef("a")]));
  });

  test("a member both named and rolled speaks once, in its mention slot (dedupe)", () => {
    const out = selectSpeakers({
      candidates: trio,
      policy: "natural",
      lastSpeaker: null,
      mentionedIds: [cid("b"), cid("b")],
      rng: scripted(...IN_ORDER, 0, 0, 0.9),
    });
    expect(keys(out)).toEqual(keys([charRef("b"), charRef("a")]));
  });

  test("nobody activated: ONE random member speaks, drawn from the members with talkativeness above 0", () => {
    const candidates = [cc("mute-ish", { talkativeness: 0 }), cc("b"), cc("c")];
    // Every roll fails; the fallback draw 0.6 over the two chatty members [b, c] picks index 1 → c.
    const out = selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: scripted(...IN_ORDER, ...ALL_FAIL, 0.6) });
    expect(keys(out)).toEqual(keys([charRef("c")]));
  });

  test("nobody activated and every talkativeness is 0: the one random member comes from the whole pool", () => {
    const candidates = [cc("a", { talkativeness: 0 }), cc("b", { talkativeness: 0 })];
    const out = selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: scripted(0.1, 0.2, 0.9, 0.9, 0.1) });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });

  test("a zero-talkativeness member never speaks unprompted beside a chatty one (every seed)", () => {
    const candidates = [cc("quiet", { talkativeness: 0 }), cc("loud", { talkativeness: 0.5 })];
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(keys(selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, rng: seededRng(seed) }))).toEqual(keys([charRef("loud")]));
    }
  });

  test("ban-last ON: the last speaker is out of the pool — naming it does not bring it back", () => {
    const out = selectSpeakers({
      candidates: trio,
      policy: "natural",
      lastSpeaker: charRef("a"),
      mentionedIds: [cid("a")],
      // Pool is [b, c]: two keys, two passing rolls.
      rng: scripted(0.1, 0.2, 0, 0),
    });
    expect(keys(out)).toEqual(keys([charRef("b"), charRef("c")]));
  });

  test("ban-last OFF (allowSelfResponses): the last speaker can be named and can roll", () => {
    const out = selectSpeakers({
      candidates: trio,
      policy: "natural",
      lastSpeaker: charRef("a"),
      banLast: false,
      mentionedIds: [cid("a")],
      rng: scripted(...IN_ORDER, ...ALL_FAIL),
    });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });

  test("ban-last yields on a solo roster: the one member is restored and the fallback lets it speak", () => {
    const out = selectSpeakers({
      candidates: [cc("solo", { talkativeness: 0 })],
      policy: "natural",
      lastSpeaker: charRef("solo"),
      rng: scripted(0.5, 0.9, 0.5),
    });
    expect(keys(out)).toEqual(keys([charRef("solo")]));
  });

  test("a named member who is muted or gone stays silent; the rolls still run", () => {
    const candidates = [cc("a"), cc("muted", { disabled: true }), cc("gone", { leftSeq: 2 })];
    const out = selectSpeakers({ candidates, policy: "natural", lastSpeaker: null, mentionedIds: [cid("muted"), cid("gone")], rng: scripted(0.1, 0.4) });
    expect(keys(out)).toEqual(keys([charRef("a")]));
  });

  test("maxSpeakers caps AFTER mention-first ordering (a generate's one reply goes to the named member)", () => {
    const out = selectSpeakers({
      candidates: trio,
      policy: "natural",
      lastSpeaker: null,
      mentionedIds: [cid("c")],
      rng: scripted(...IN_ORDER, 0, 0, 0),
      maxSpeakers: 1,
    });
    expect(keys(out)).toEqual(keys([charRef("c")]));
  });

  test("an @mention is still the hard override: it wins over a word mention and skips the rolls", () => {
    const out = selectSpeakers({ candidates: trio, policy: "natural", lastSpeaker: null, forcedIds: [cid("b")], mentionedIds: [cid("a")], rng: scripted() });
    expect(keys(out)).toEqual(keys([charRef("b")]));
  });

  test("word mentions are natural's alone: `list` ignores them", () => {
    const out = selectSpeakers({ candidates: trio, policy: "list", lastSpeaker: null, mentionedIds: [cid("c")], rng: scripted() });
    expect(keys(out)).toEqual(keys([charRef("a"), charRef("b"), charRef("c")]));
  });

  test("the smart arm reached without the side-LLM (narrator room) activates exactly like natural", () => {
    const rolls = [...IN_ORDER, 0.4, 0.6, 0.5] as const;
    const natural = selectSpeakers({ candidates: trio, policy: "natural", lastSpeaker: null, mentionedIds: [cid("b")], rng: scripted(...rolls) });
    const smart = selectSpeakers({ candidates: trio, policy: "smart", lastSpeaker: null, mentionedIds: [cid("b")], rng: scripted(...rolls) });
    expect(keys(smart)).toEqual(keys(natural));
  });
});

describe("resolveNameMentions — a character named as a plain word (human-authored text only)", () => {
  const characters = [
    { ref: charRef("aria"), name: "Aria Stormborn" },
    { ref: charRef("bran"), name: "Bran" },
    { ref: charRef("ariel"), name: "Aria Vell" },
  ];

  test("any word of the name names the character, case-insensitive, in the order the message names them", () => {
    expect(resolveNameMentions("bran, ask STORMBORN about it", characters)).toEqual([cid("bran"), cid("aria")]);
  });

  test("a word two names share names both", () => {
    expect(resolveNameMentions("Aria?", characters)).toEqual([cid("aria"), cid("ariel")]);
  });

  test("a name inside a longer word is not a mention", () => {
    expect(resolveNameMentions("Brandon and Arianna arrive", characters)).toEqual([]);
  });

  test("a repeated name counts once; no text, no mentions", () => {
    expect(resolveNameMentions("Bran! Bran!", characters)).toEqual([cid("bran")]);
    expect(resolveNameMentions("", characters)).toEqual([]);
  });

  test("a stopword in a name never names the character; its real name word does", () => {
    const cast = [{ ref: charRef("knight"), name: "The Knight" }, ...characters];
    expect(resolveNameMentions("Open the door.", cast)).toEqual([]);
    expect(resolveNameMentions("Knight, open the door.", cast)).toEqual([cid("knight")]);
    for (const stopword of NAME_STOPWORDS) {
      expect(resolveNameMentions(`${stopword} ${stopword}`, [{ ref: charRef("lady"), name: "Lady of the Lake" }])).toEqual([]);
    }
  });

  test("a contraction never names an apostrophe name: one-letter name words do not name", () => {
    const cast = [
      { ref: charRef("tpol"), name: "T'Pol" },
      { ref: charRef("dart"), name: "D'Artagnan" },
    ];
    expect(resolveNameMentions("I don't know.", cast)).toEqual([]);
    expect(resolveNameMentions("I'd rather not.", cast)).toEqual([]);
    expect(resolveNameMentions("Pol, and you, Artagnan?", cast)).toEqual([cid("tpol"), cid("dart")]);
  });

  test("a name made only of one-letter words is named by its whole name as a phrase", () => {
    const cast = [{ ref: charRef("aj"), name: "A. J." }];
    expect(resolveNameMentions("Ask a friend.", cast)).toEqual([]);
    expect(resolveNameMentions("Ask A J about it.", cast)).toEqual([cid("aj")]);
  });

  test("a decomposed accent names the composed name, and the other way round (NFC)", () => {
    const composed = "Chloé";
    const decomposed = "Chloé";
    expect(resolveNameMentions(`${decomposed}?`, [{ ref: charRef("acc"), name: composed }])).toEqual([cid("acc")]);
    expect(resolveNameMentions(`${composed}?`, [{ ref: charRef("acc"), name: decomposed }])).toEqual([cid("acc")]);
  });

  test("a name made only of stopwords is named by its whole name as a phrase", () => {
    const cast = [{ ref: charRef("her"), name: "Her" }, { ref: charRef("you-two"), name: "You Two" }, ...characters];
    expect(resolveNameMentions("Bran, ask her.", cast)).toEqual([cid("bran"), cid("her")]);
    expect(resolveNameMentions("Nobody here.", cast)).toEqual([]);
    // "You Two" has a real word, so only "two" names it — "you" alone never does.
    expect(resolveNameMentions("Can you help?", cast)).toEqual([]);
  });

  test("Unicode names split into words the same way", () => {
    const world = [
      { ref: charRef("cyr"), name: "Аня" },
      { ref: charRef("acc"), name: "Chloé" },
    ];
    expect(resolveNameMentions("Привет, аня. Chloé?", world)).toEqual([cid("cyr"), cid("acc")]);
    expect(resolveNameMentions("Анятолия", world)).toEqual([]);
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
  const characters = [
    { ref: charRef("aria"), name: "Aria" },
    { ref: charRef("ariastorm"), name: "Aria Stormborn" },
    { ref: charRef("bran"), name: "Bran" },
  ];

  test("extracts @mentions in first-appearance order", () => {
    expect(resolveMentions("hey @Bran and @Aria", characters)).toEqual([cid("bran"), cid("aria")]);
  });

  test("longest-name-first: @Aria Stormborn matches the longer name, not @Aria", () => {
    expect(resolveMentions("@Aria Stormborn, attack!", characters)).toEqual([cid("ariastorm")]);
  });

  test("case-insensitive; no @ → nothing", () => {
    expect(resolveMentions("@aria", characters)).toEqual([cid("aria")]);
    expect(resolveMentions("Aria without an at-sign", characters)).toEqual([]);
  });

  // FIRST-OCCURRENCE MASKING: a shorter name whose FIRST occurrence sits inside a longer name's consumed
  // span must still fire on a LATER standalone occurrence — the human typed `@Aria` on purpose.
  test("a later standalone @Aria still forces her, even after @Aria Stormborn consumed the first hit", () => {
    expect(resolveMentions("@Aria Stormborn opens the door… @Aria, what do you think?", characters)).toEqual([cid("ariastorm"), cid("aria")]);
  });

  test("the nested-only case is unchanged: @Aria Stormborn alone forces ONLY the longer name", () => {
    expect(resolveMentions("@Aria Stormborn opens the door.", characters)).toEqual([cid("ariastorm")]);
  });

  // The masking unit is the NAME, not the ONE span that name happened to claim. A human who emphasises a
  // character by naming her twice left the second occurrence unmasked, so the nested shorter name matched
  // INSIDE it and a second, never-named character was forced into the round (and in a narrator room that
  // forced override also coerces the round to per-speaker — a round the host never asked for).
  test("a REPEATED @Aria Stormborn never leaks the nested @Aria (masking is per-NAME, not per-span)", () => {
    expect(resolveMentions("@Aria Stormborn opens the door… @Aria Stormborn kicks it shut.", characters)).toEqual([cid("ariastorm")]);
  });

  test("empty text / empty characters → no mentions", () => {
    expect(resolveMentions("", characters)).toEqual([]);
    expect(resolveMentions("@Aria", [])).toEqual([]);
  });

  // #1439 — the boundary was `\b`, which JavaScript defines over ASCII `\w` even under the `u` flag. A character
  // name whose LAST character is not an ASCII word character therefore had no letter→non-letter transition
  // to assert at an ordinary `@Name ` and the mention silently did not resolve. This runs on every human turn.
  describe("Unicode character names resolve (the boundary is a property class, not \\b)", () => {
    const world = [
      { ref: charRef("cyr"), name: "Аня" },
      { ref: charRef("cjk"), name: "結衣" },
      { ref: charRef("acc"), name: "Chloé" },
      { ref: charRef("emo"), name: "Nova🌙" },
      { ref: charRef("cyrlong"), name: "Анятолия" },
    ];

    test("Cyrillic, CJK, accented and emoji-suffixed names all resolve at a plain space", () => {
      expect(resolveMentions("@Аня открыла дверь", world)).toEqual([cid("cyr")]);
      expect(resolveMentions("@結衣 が入ってきた", world)).toEqual([cid("cjk")]);
      expect(resolveMentions("@Chloé arrive", world)).toEqual([cid("acc")]);
      expect(resolveMentions("@Nova🌙 waves", world)).toEqual([cid("emo")]);
    });

    test("…and at punctuation, at end-of-text, and NOT inside a longer Unicode word", () => {
      expect(resolveMentions("@Аня, стой!", world)).toEqual([cid("cyr")]);
      expect(resolveMentions("@結衣", world)).toEqual([cid("cjk")]);
      // The long name wins its own span; the short one must NOT also fire off the prefix inside it.
      expect(resolveMentions("@Анятолия смотрит", world)).toEqual([cid("cyrlong")]);
    });
  });
});
