// Stage planning: how one registry row runs at a tier and selection, and the result row a stage that did not run
// publishes. The runner (../ops/run.ts) decides with these; both are exported so a test can drive the real pair.
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { Selection } from "../contract/selection.ts";
import type { StageDef, StageMode, StageResult, Tier } from "../contract/stage.ts";

/** Resolve how a stage runs at this tier+scope: its concrete argv, or a mode sentinel. */
export function planStage(
  stage: StageDef,
  selection: Selection | undefined,
  tier?: Tier,
  root?: string,
): {
  readonly mode: StageMode;
  readonly argv: readonly [string, ...string[]] | null;
  readonly runsAt: string | null;
} {
  if (selection === undefined) {
    // CONDITIONAL TIER MEMBERSHIP (#1523). A whole-tier run has no Selection, so a stage that belongs to
    // this tier only under a condition asks its own precondition here. `null` (cannot tell) RUNS: an
    // expensive stage skipped on an unanswerable question is a false clean wearing a tier's clothes.
    const precondition = stage.tierPrecondition;
    if (precondition !== undefined && tier !== undefined && precondition.tiers.includes(tier) && precondition.satisfied(root ?? process.cwd()) === false) {
      return { mode: "skipped", argv: null, runsAt: unconditionalTier(stage) };
    }
    return { mode: "full", argv: stage.argv, runsAt: null };
  }
  // Scoped run: a stage with no scopedArgv is whole-only ⇒ deferred.
  if (stage.scopedArgv === undefined) {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  const scoped = stage.scopedArgv(selection);
  if (scoped === "whole-only") {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  if (scoped === "skip-empty") {
    return { mode: "skipped", argv: null, runsAt: null };
  }
  return { mode: "scoped", argv: scoped, runsAt: null };
}

/** Where a precondition-skipped stage DOES run unconditionally — the notice must name a tier that will
 *  actually run it, never the one that just declined. */
function unconditionalTier(stage: StageDef): string {
  const conditional = new Set(stage.tierPrecondition?.tiers ?? []);
  for (const t of ["static", "push", "full"] as const) {
    if (stage.tiers.includes(t) && !conditional.has(t)) {
      return `verify --${t}`;
    }
  }
  return "verify --full";
}

/** The tier a deferred stage runs at — the lowest non-changed tier it belongs to (for the notice). */
function pushOrStatic(stage: StageDef): string {
  for (const t of ["static", "push", "full"] as const) {
    if (stage.tiers.includes(t)) {
      return `verify --${t}`;
    }
  }
  return "verify --full";
}

/** THE RESULT A STAGE THAT DID NOT RUN PUBLISHES — one home, and EXPORTED so the notice has a producer
 *  test (#1566). It was inline, which left the notice provable only through a hand-built `StageResult`:
 *  a renderer pin that stayed green with the notice line deleted. This is the smallest honest seam — the
 *  planner decides, this shapes the row, and both are now reachable from a test.
 *
 *  THE NOTICE IS THE CONDITION, in the stage's own words. `stageLine` says THAT the precondition
 *  declined; this says WHICH one, so a reader can tell "my diff touched no instrument" from "the gate is
 *  broken" without opening the registry — and because `notices` is a `StageResult` field, the same string
 *  is in verify.json by construction. */
export function nonRunningStageResult(stage: StageDef, plan: { readonly mode: StageMode; readonly runsAt: string | null }): StageResult {
  return {
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok: true, // a deferred/skipped stage is not a failure — it just didn't run here
    exitCode: EXIT.clean,
    durationMs: 0,
    logFile: null,
    failureExcerpt: null,
    runsAt: plan.runsAt,
    notices:
      plan.mode === "skipped" && plan.runsAt !== null && stage.tierPrecondition !== undefined ? [`tier precondition: ${stage.tierPrecondition.reason}`] : [],
  };
}
