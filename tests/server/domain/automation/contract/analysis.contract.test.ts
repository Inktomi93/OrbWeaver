// Unit tests for contract/analysis (S5): the twist-bank MERGE invariants as PROPERTY tests (retire-before-
// add · the durable cap · dedup/no-resurrection — a deterministic seeded generator, no fixture can hide a
// case), the stored-state VERSION POSTURE (corrupt = unparseable ONLY; a missing/damaged field defaults
// alone and the WATERMARK survives — the orchestrator-ruled pin), and the route-composed payload schema
// (the needle wall's server-side tier: an un-authored route's field is STRIPPED by the very zod the wire
// schema projects from).

import type { AnalysisPayload, AnalysisState } from "../../../../../packages/server/src/domain/automation/contract/analysis.ts";
import {
  ANALYSIS_ARC_MAX,
  ANALYSIS_RETIRED_CAP,
  ANALYSIS_TWIST_CAP,
  ANALYSIS_TWIST_MAX,
  buildAnalysisPayloadSchema,
  EMPTY_ANALYSIS_STATE,
  mergeAnalysisState,
  parseAnalysisState,
} from "../../../../../packages/server/src/domain/automation/contract/analysis.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A payload with only the always-present plot half (the route-gated fields absent). */
function plotPayload(
  twistOps: AnalysisPayload["twistOps"],
  arc: Partial<Pick<AnalysisPayload, "arcStatus" | "updatedArc" | "successorArc">> = {},
): AnalysisPayload {
  return { arcStatus: arc.arcStatus ?? "active", updatedArc: arc.updatedArc ?? null, successorArc: arc.successorArc ?? null, twistOps };
}

// ── the merge: pinned examples (each names its legacy law) ───────────────────────────────────────────

test("mergeAnalysisState: RETIRES apply FIRST — a completion pass retires the spent set AND seeds successors in one pass", () => {
  // The bank is FULL. Retire one, add one, same pass: the retire frees the slot the add fills — an
  // adds-first merge would drop the add at the cap and the pass could never turn the story over.
  const full: AnalysisState = { arc: "a", twists: ["t1", "t2", "t3", "t4", "t5", "t6"], retiredTwists: [], settledThroughSeq: 0 };
  const merged = mergeAnalysisState(
    full,
    plotPayload([
      { op: "add", twist: "t7" },
      { op: "retire", twist: "t1" },
    ]),
  );
  expect(merged.twists).toEqual(["t2", "t3", "t4", "t5", "t6", "t7"]);
  expect(merged.retiredTwists).toEqual(["t1"]);
  expect(merged.twistsRetired).toBe(1);
  expect(merged.twistsAdded).toBe(1);
  expect(merged.droppedAdds).toBe(0);
});

test("mergeAnalysisState: adds beyond the bank cap DROP (counted, never an error)", () => {
  const state: AnalysisState = { ...EMPTY_ANALYSIS_STATE, twists: ["t1", "t2", "t3", "t4", "t5"] };
  const merged = mergeAnalysisState(
    state,
    plotPayload([
      { op: "add", twist: "t6" },
      { op: "add", twist: "t7" },
    ]),
  );
  expect(merged.twists).toHaveLength(ANALYSIS_TWIST_CAP);
  expect(merged.twists).toContain("t6");
  expect(merged.twists).not.toContain("t7");
  expect(merged.droppedAdds).toBe(1);
});

test("mergeAnalysisState: a re-add of a RETIRED twist is a resurrection and is DROPPED (the retired bank's whole job)", () => {
  const state: AnalysisState = { ...EMPTY_ANALYSIS_STATE, twists: [], retiredTwists: ["fired"] };
  const merged = mergeAnalysisState(state, plotPayload([{ op: "add", twist: "fired" }]));
  expect(merged.twists).toEqual([]);
  expect(merged.retiredTwists).toEqual(["fired"]);
  expect(merged.droppedAdds).toBe(1);
});

test("mergeAnalysisState: arc semantics — completed swaps in successorArc; active refreshes via updatedArc; null carries", () => {
  const state: AnalysisState = { ...EMPTY_ANALYSIS_STATE, arc: "the debt" };
  expect(mergeAnalysisState(state, plotPayload([], { arcStatus: "completed", successorArc: "the reckoning" })).arc).toBe("the reckoning");
  expect(mergeAnalysisState(state, plotPayload([], { updatedArc: "the debt, sharpened" })).arc).toBe("the debt, sharpened");
  expect(mergeAnalysisState(state, plotPayload([])).arc).toBe("the debt");
  // completed with NO successor falls back to updatedArc, then to the carried arc — never to "".
  expect(mergeAnalysisState(state, plotPayload([], { arcStatus: "completed" })).arc).toBe("the debt");
});

test("mergeAnalysisState: the retired bank FIFO-ages at its cap (oldest out first)", () => {
  const retired = Array.from({ length: ANALYSIS_RETIRED_CAP }, (_, i) => `old${i}`);
  const state: AnalysisState = { ...EMPTY_ANALYSIS_STATE, twists: ["live"], retiredTwists: retired };
  const merged = mergeAnalysisState(state, plotPayload([{ op: "retire", twist: "live" }]));
  expect(merged.retiredTwists).toHaveLength(ANALYSIS_RETIRED_CAP);
  expect(merged.retiredTwists).not.toContain("old0"); // the oldest aged out
  expect(merged.retiredTwists.at(-1)).toBe("live");
});

// ── #1480 item 3: the stored blob is CLAMPED ON READ, never refused ─────────────────────────────────
// The bounds the LIVE write paths already enforce (`ANALYSIS_ARC_MAX` on updatedArc/successorArc,
// `ANALYSIS_TWIST_MAX` per twist op, `ANALYSIS_TWIST_CAP`/`ANALYSIS_RETIRED_CAP` on the banks) stopped at
// the model payload: the parse-on-read schema accepted an unbounded arc and unbounded arrays of unbounded
// strings, and `mergeAnalysisState` only refused to ADD past the cap — it never shrank a bank that was
// already over it. So a hand-corrupted / restored / imported row carried its whole payload into every
// subsequent assembled prompt AND back out through the pass write, forever.
//
// THE ARM IS CLAMP, NOT REFUSE (memory `the parse-on-read-schemas-cannot-be-tightened memory lesson`): this schema is
// parsed by the READER, so a new `.max()` refusal would make already-stored rows unreadable — the whole
// row would fall to EMPTY_ANALYSIS_STATE and RESET THE WATERMARK. The row must still parse; it just reads
// back bounded.

test("parseAnalysisState CLAMPS an oversized legacy blob — it parses (never refused) and reads back bounded", () => {
  const oversized = {
    arc: "a".repeat(ANALYSIS_ARC_MAX * 3),
    twists: Array.from({ length: ANALYSIS_TWIST_CAP * 4 }, (_, i) => `${i}-${"t".repeat(ANALYSIS_TWIST_MAX * 3)}`),
    retiredTwists: Array.from({ length: ANALYSIS_RETIRED_CAP * 3 }, (_, i) => `r${i}-${"x".repeat(ANALYSIS_TWIST_MAX * 2)}`),
    settledThroughSeq: 77,
  };
  const parsed = parseAnalysisState(oversized);

  // NOT refused — the watermark survives, which is the whole point of clamping rather than tightening.
  expect(parsed.settledThroughSeq).toBe(77);
  expect(parsed.arc).toHaveLength(ANALYSIS_ARC_MAX);
  expect(parsed.arc).toBe(oversized.arc.slice(0, ANALYSIS_ARC_MAX));
  expect(parsed.twists).toHaveLength(ANALYSIS_TWIST_CAP);
  expect(parsed.retiredTwists).toHaveLength(ANALYSIS_RETIRED_CAP);
  for (const twist of [...parsed.twists, ...parsed.retiredTwists]) {
    expect(twist.length).toBeLessThanOrEqual(ANALYSIS_TWIST_MAX);
  }
  // The BANK keeps its oldest (the cap is what `applyAdds` refuses to grow past); the RETIRED bank keeps
  // its newest (FIFO age-out, the same direction `mergeAnalysisState` ages it).
  expect(parsed.twists[0]).toBe(oversized.twists[0]?.slice(0, ANALYSIS_TWIST_MAX));
  expect(parsed.retiredTwists.at(-1)).toBe(oversized.retiredTwists.at(-1)?.slice(0, ANALYSIS_TWIST_MAX));
});

test("mergeAnalysisState SHRINKS an already-oversized live bank to the cap (a merge is never a way to keep it)", () => {
  // A state built past the cap in memory — the shape a pre-clamp stored blob handed the pass, and the shape
  // the confirm path's faithful round-trip could still hand it.
  const oversized: AnalysisState = {
    arc: "a".repeat(ANALYSIS_ARC_MAX * 2),
    twists: Array.from({ length: ANALYSIS_TWIST_CAP * 3 }, (_, i) => `t${i}`),
    retiredTwists: [],
    settledThroughSeq: 5,
  };
  const merged = mergeAnalysisState(oversized, plotPayload([]));
  expect(merged.twists).toHaveLength(ANALYSIS_TWIST_CAP);
  expect(merged.arc).toHaveLength(ANALYSIS_ARC_MAX);
  // …and a retire against an oversized bank still frees a slot rather than being eaten by the shrink.
  const retired = mergeAnalysisState(oversized, plotPayload([{ op: "retire", twist: "t0" }]));
  expect(retired.twists).toHaveLength(ANALYSIS_TWIST_CAP);
  expect(retired.twists).not.toContain("t0");
  expect(retired.retiredTwists).toEqual(["t0"]);
});

// ── the merge: PROPERTY sweep (a deterministic seeded generator — no library, no hidden flake) ───────

/** A tiny LCG — deterministic across runs, so a failing case is reproducible by its seed. */
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 4_294_967_296; // 2^32
function lcg(seed: number): () => number {
  let s = seed % LCG_MODULUS;
  return () => {
    s = (s * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return s / LCG_MODULUS;
  };
}

const PROPERTY_CASES = 250;
const TWIST_POOL = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

test(`mergeAnalysisState invariants hold over ${PROPERTY_CASES} generated op sequences (cap · dedup · disjoint banks)`, () => {
  for (let seed = 1; seed <= PROPERTY_CASES; seed += 1) {
    const rnd = lcg(seed);
    const startTwists = TWIST_POOL.filter(() => rnd() < 0.4).slice(0, ANALYSIS_TWIST_CAP);
    const startRetired = TWIST_POOL.filter((t) => !startTwists.includes(t) && rnd() < 0.3);
    const state: AnalysisState = { ...EMPTY_ANALYSIS_STATE, twists: startTwists, retiredTwists: startRetired };
    const opCount = Math.floor(rnd() * 8);
    const twistOps = Array.from({ length: opCount }, () => ({
      op: rnd() < 0.5 ? ("add" as const) : ("retire" as const),
      twist: TWIST_POOL[Math.floor(rnd() * TWIST_POOL.length)] ?? "a",
    }));
    const merged = mergeAnalysisState(state, plotPayload(twistOps));

    const label = `seed=${seed} ops=${JSON.stringify(twistOps)}`;
    // The durable cap is never exceeded.
    expect(merged.twists.length, label).toBeLessThanOrEqual(ANALYSIS_TWIST_CAP);
    expect(merged.retiredTwists.length, label).toBeLessThanOrEqual(ANALYSIS_RETIRED_CAP);
    // Both banks stay dedup'd…
    expect(new Set(merged.twists).size, label).toBe(merged.twists.length);
    expect(new Set(merged.retiredTwists).size, label).toBe(merged.retiredTwists.length);
    // …and DISJOINT: no twist is simultaneously live and retired (a retired twist never resurrects).
    const liveAndRetired = merged.twists.filter((t) => merged.retiredTwists.includes(t));
    expect(liveAndRetired, label).toEqual([]);
    // Every retired-op twist ends up in the retired bank (retire is total, never dropped) — unless the
    // retired bank's FIFO cap aged it out in the same pass.
    const retireTargets = twistOps.filter((op) => op.op === "retire").map((op) => op.twist);
    const missingRetires = retireTargets.filter((t) => !merged.retiredTwists.includes(t));
    const fifoSaturated = merged.retiredTwists.length === ANALYSIS_RETIRED_CAP;
    expect(fifoSaturated ? [] : missingRetires, label).toEqual([]);
    // The added counter reconciles: every counted add is a twist that is live now and was not before.
    const netNew = merged.twists.filter((t) => !state.twists.includes(t));
    expect(netNew.length, label).toBe(merged.twistsAdded);
  }
});

// ── the stored-state VERSION POSTURE (orchestrator ruling 2026-08-24) ────────────────────────────────

test("parseAnalysisState: a row missing a NEWLY-ADDED field reads with it defaulted — the watermark is PRESERVED", () => {
  // A pre-widening row: no `arc` field at all. The watermark must survive; discarding it would re-cover an
  // already-distilled span into DUPLICATE lore.
  const parsed = parseAnalysisState({ twists: ["t"], retiredTwists: [], settledThroughSeq: 42 });
  expect(parsed.settledThroughSeq).toBe(42);
  expect(parsed.arc).toBe("");
  expect(parsed.twists).toEqual(["t"]);
});

test("parseAnalysisState: ONE damaged field degrades ALONE (per-field catch) — the watermark survives", () => {
  const parsed = parseAnalysisState({ arc: 7, twists: "not-an-array", retiredTwists: ["r"], settledThroughSeq: 9 });
  expect(parsed.arc).toBe("");
  expect(parsed.twists).toEqual([]);
  expect(parsed.retiredTwists).toEqual(["r"]);
  expect(parsed.settledThroughSeq).toBe(9);
});

test("parseAnalysisState: only UNPARSEABLE garbage resets whole — and the reset watermark is 0 (re-cover, never skip)", () => {
  expect(parseAnalysisState("not an object")).toEqual(EMPTY_ANALYSIS_STATE);
  expect(parseAnalysisState(null)).toEqual(EMPTY_ANALYSIS_STATE);
  expect(parseAnalysisState(EMPTY_ANALYSIS_STATE.settledThroughSeq)).toEqual(EMPTY_ANALYSIS_STATE);
});

// ── the route-composed payload schema (the needle wall's SERVER-SIDE tier) ───────────────────────────

const FULL_PROSE_PAYLOAD = {
  arcStatus: "active",
  updatedArc: "an arc {{getglobalvar::secret}}",
  successorArc: null,
  twistOps: [{ op: "add", twist: "a twist" }],
  guidance: "steer {{setvar::x::1}}",
  score: 9,
};

test("buildAnalysisPayloadSchema: `score` is STRIPPED when the vars route is un-authored — the model-independent needle pin", () => {
  // The route-composed zod is the SAME composition the wire schema projects from; on a non-enforcing wire
  // vehicle a stray `score` arrives here and must die BEFORE any applier can see it.
  const schema = buildAnalysisPayloadSchema({ steer: { apply: "direct" } });
  const parsed = schema.parse(FULL_PROSE_PAYLOAD);
  expect(parsed).not.toHaveProperty("score");
  expect(parsed).not.toHaveProperty("lore");
  expect(parsed.guidance).toBe("steer {{setvar::x::1}}"); // guidance passes (its route IS authored) — VERBATIM.
});

test("buildAnalysisPayloadSchema: an authored vars route REQUIRES a bounded numeric score (0..10)", () => {
  const schema = buildAnalysisPayloadSchema({ vars: { key: "tension" } });
  expect(schema.safeParse({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], score: 7 }).success).toBe(true);
  expect(schema.safeParse({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], score: 11 }).success).toBe(false);
  expect(schema.safeParse({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], score: "9" }).success).toBe(false);
  // Absent when required-by-route ⇒ refused (all-required keeps the projected wire schema strict-friendly).
  expect(schema.safeParse({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [] }).success).toBe(false);
});

test("buildAnalysisPayloadSchema: the suggest route admits at most ONE suggestion (the S4 slot law)", () => {
  const schema = buildAnalysisPayloadSchema({ suggest: {} });
  const base = { arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [] };
  expect(schema.safeParse({ ...base, suggestions: [{ text: "cut to the chase" }] }).success).toBe(true);
  expect(schema.safeParse({ ...base, suggestions: [{ text: "one" }, { text: "two" }] }).success).toBe(false);
});
