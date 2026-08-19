// The §8 PREFLIGHT WARN, as one derivation — is a stage over budget, in which direction, and in whose
// words. It left `lane-run-control.tsx` on 2026-08-19 for the same reason the not-run copy left the two
// lanes (`stage-not-run-copy.ts`): the SURFACE now has to answer a question about all three stages at once,
// and a sentence spelled inside one lane cannot be compared across them.
//
// WHY THE SURFACE ASKS AT ALL (side-eye 2026-08-19 P2). The warn is per-stage and correct per-stage, but
// the CONTEXT-OVERRUN arm's sentence says nothing about which stage it is: when score and analyze both
// breached, the canvas printed the identical paragraph twice, with two buttons both named "Narrow the
// selection", about one selection. That is one fact wearing two bodies — the same disease as the twin
// pickers and the twin run verbs this pass is about. So: identical message on 2+ stages ⇒ ONE session-level
// instance; different messages ⇒ each lane keeps its own, because then they really are different facts.
//
// THE COPY IS UNTOUCHED, deliberately (the review's own "do not touch" list: "the preflight copy is a 4/4
// error message — just show it once"). Both sentences below are byte-identical to the ones that shipped in
// `lane-run-control.tsx`; only their HOME and their multiplicity changed.

import type { RefineryStage } from "@orb/contracts/refinery";
import type { useRefineryPreflight } from "../hooks/use-refinery-schemas.ts";

// Re-derived from the preflight hook's wire shape (§7.4 — never an exported alias of someone else's type).
type PreflightData = ReturnType<typeof useRefineryPreflight>["data"];
type StagePreflightView = NonNullable<PreflightData>["stages"][number];

/** One stage's budget verdict: the two over-budget directions and the sentence they earn. */
export interface StageWarn {
  /** The expected OUTPUT exceeds the resolved max output — the fit line's ⚠ fires on either arm. */
  readonly outputOver: boolean;
  /** The assembled prompt exceeds the model's context. */
  readonly inputOver: boolean;
  /** The advisory, in the user's words. Null when the stage fits — the ONE thing callers switch on. */
  readonly message: string | null;
}

/** A stage's warn verdict. `outputOver` wins the wording when both breach: an output overrun names a
 *  concrete ceiling and a concrete remedy (raise max output), which is the more actionable of the two. */
export function stageWarnOf(stagePre: StagePreflightView | undefined, contextTokens: number | null): StageWarn {
  if (stagePre === undefined) {
    return { outputOver: false, inputOver: false, message: null };
  }
  const outputOver = stagePre.maxOutputTokens !== null && stagePre.outputEstimate > stagePre.maxOutputTokens;
  const inputOver = contextTokens !== null && stagePre.inputEstimate > contextTokens;
  if (outputOver) {
    return {
      outputOver,
      inputOver,
      message: `The expected ${stagePre.stage} output likely exceeds the resolved max output (${stagePre.maxOutputTokens} tok) — a thinking model spends this budget on reasoning too. Raise max output in the preset, or narrow the selection.`,
    };
  }
  return { outputOver, inputOver, message: inputOver ? "The assembled prompt likely exceeds the model's context — narrow the selection." : null };
}

/**
 * The whole preflight READING the workbench does, derived in one call: the context ceiling both the lanes
 * and the warn compare against, the SESSION-level warn, and the stages that warn speaks for — which are
 * exactly the stages whose own copy is suppressed. One function because the three are one decision, and
 * because a surface at its `component-size` cap may not spell a derivation it can import.
 */
export function preflightViewOf(data: PreflightData): {
  readonly contextTokens: number | null;
  readonly sessionWarn: { readonly message: string; readonly stages: readonly RefineryStage[] } | null;
  readonly hoistedStages: readonly RefineryStage[];
} {
  const contextTokens = data?.contextTokens ?? null;
  const sessionWarn = sessionWarnOf(data, contextTokens);
  return { contextTokens, sessionWarn, hoistedStages: sessionWarn?.stages ?? [] };
}

/** The stages a hoisted warn speaks for, worded for a control's accessible NAME ("score and analyze") —
 *  the thing that tells the session-level button apart from a per-lane one if the two ever coexist. */
export function warnScopeOf(stages: readonly RefineryStage[]): string {
  return stages.length < 2 ? (stages[0] ?? "this session") : `${stages.slice(0, -1).join(", ")} and ${stages.at(-1) ?? ""}`;
}

/** The SESSION-level warn: the one message more than one stage produced VERBATIM, with the stages it
 *  speaks for. Null when at most one stage breaches, or when the breaching stages disagree — divergence is
 *  the case where a per-lane warn is the honest shape, because the lanes are then saying different things.
 *
 *  Byte-identity is the test on purpose: the output-overrun sentence embeds its stage's name and its own
 *  ceiling, so two output overruns are two different facts and stay in their lanes. Only the context-overrun
 *  sentence — which is about the selection, a session-wide thing — can ever collapse. */
function sessionWarnOf(data: PreflightData, contextTokens: number | null): { readonly message: string; readonly stages: readonly RefineryStage[] } | null {
  const byMessage = new Map<string, RefineryStage[]>();
  for (const stagePre of data?.stages ?? []) {
    const { message } = stageWarnOf(stagePre, contextTokens);
    if (message === null) {
      continue;
    }
    const stages = byMessage.get(message) ?? [];
    stages.push(stagePre.stage);
    byMessage.set(message, stages);
  }
  for (const [message, stages] of byMessage) {
    if (stages.length > 1) {
      return { message, stages };
    }
  }
  return null;
}
