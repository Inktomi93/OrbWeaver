// Unit: the §8 preflight warn's HOIST decision (side-eye 2026-08-19 P2). The CT proves the rendered
// result on the real surface; this proves the rule the render is a function of, at every arm the CT
// cannot cheaply reach — because the rule is a claim about STRING IDENTITY, and the two sentences it
// discriminates differ only in what they embed.
//
// The rule: a message produced VERBATIM by more than one stage is hoisted to one session-level instance
// (a context overrun is about the SELECTION, which every stage shares); different messages stay per-lane
// (they are then different facts). The output-overrun sentence embeds its own stage name and ceiling, so
// it can never collide with another stage's — which is what keeps two real problems from being folded
// into one line.

import type { RefineryStage } from "@orb/contracts/refinery";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { preflightViewOf, stageWarnOf, warnScopeOf } from "../../../../../packages/client/src/features/refinery/lib/preflight-warn.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CONTEXT_TOKENS = 8000;

// The fixture shapes are DERIVED from the functions under test (§7.4 — never re-spelled): the wire slice
// carries a BRANDED `ModelId`, and a hand-written shape here would either drift from it or need a cast.
type StageSlice = NonNullable<Parameters<typeof stageWarnOf>[0]>;
type PreflightData = Parameters<typeof preflightViewOf>[0];

/** One stage's preflight slice on the wire shape `refinery.preflight` returns. */
function slice(stage: RefineryStage, over: { input?: boolean; output?: boolean } = {}): StageSlice {
  return {
    stage,
    model: castId<ModelId>("test-model"),
    temperature: null,
    maxOutputTokens: over.output === true ? 512 : 4096,
    inputEstimate: over.input === true ? 12_000 : 2736,
    outputEstimate: 1490,
  };
}

function data(stages: readonly StageSlice[]): PreflightData {
  return { contextTokens: CONTEXT_TOKENS, stages: [...stages] };
}

test("a stage that fits earns no sentence at all — the warn is a state, never a reserved row", () => {
  const warn = stageWarnOf(slice("score"), CONTEXT_TOKENS);
  expect(warn.message).toBeNull();
  expect(warn.inputOver).toBe(false);
  expect(warn.outputOver).toBe(false);
});

test("an OUTPUT overrun words itself per stage — two of them are two facts, and never collapse into one", () => {
  const score = stageWarnOf(slice("score", { output: true }), CONTEXT_TOKENS);
  const analyze = stageWarnOf(slice("analyze", { output: true }), CONTEXT_TOKENS);
  expect(score.message).toContain("score");
  expect(analyze.message).toContain("analyze");
  expect(score.message).not.toBe(analyze.message);
  // …so the hoist declines: the canvas keeps one warning per lane, each about its own budget.
  expect(preflightViewOf(data([slice("score", { output: true }), slice("analyze", { output: true })])).sessionWarn).toBeNull();
});

test("a CONTEXT overrun on two stages is ONE fact — it hoists, and names both stages for the button", () => {
  const view = preflightViewOf(data([slice("score", { input: true }), slice("rewrite"), slice("analyze", { input: true })]));
  expect(view.sessionWarn?.message).toBe("The assembled prompt likely exceeds the model's context — narrow the selection.");
  expect(view.sessionWarn?.stages).toEqual(["score", "analyze"]);
  // The lanes whose copy the hoist replaces — exactly the breaching ones, never the lane that fits.
  expect(view.hoistedStages).toEqual(["score", "analyze"]);
});

test("ONE stage over context keeps its own warning — a session-level instance would over-claim", () => {
  const view = preflightViewOf(data([slice("score", { input: true }), slice("rewrite"), slice("analyze")]));
  expect(view.sessionWarn).toBeNull();
  expect(view.hoistedStages).toEqual([]);
  expect(stageWarnOf(slice("score", { input: true }), CONTEXT_TOKENS).message).not.toBeNull();
});

test("the output arm WINS the wording when a stage breaches both — it names a ceiling and a remedy", () => {
  const warn = stageWarnOf(slice("rewrite", { input: true, output: true }), CONTEXT_TOKENS);
  expect(warn.inputOver).toBe(true);
  expect(warn.outputOver).toBe(true);
  expect(warn.message).toContain("Raise max output in the preset");
});

test("the hoisted button's scope reads as a sentence, whatever the stage count", () => {
  expect(warnScopeOf(["score", "analyze"])).toBe("score and analyze");
  expect(warnScopeOf(["score", "rewrite", "analyze"])).toBe("score, rewrite and analyze");
  expect(warnScopeOf(["score"])).toBe("score");
});

test("no preflight data at all is not a warning — an unresolved budget must not read as a breach", () => {
  const view = preflightViewOf(undefined);
  expect(view.contextTokens).toBeNull();
  expect(view.sessionWarn).toBeNull();
  expect(stageWarnOf(undefined, null).message).toBeNull();
});
