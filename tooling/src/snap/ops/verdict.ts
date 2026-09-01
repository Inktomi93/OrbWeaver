// The failure ledger: per-outcome totals, evidence failure counts, and the ONE summary whose any-non-
// zero member reddens the exit — snap is CI-usable because this is exhaustive, not vibes.
import type { CapturedConsole } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CaptureOutcome } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import { consoleFailureCounts } from "./noise.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface EvidenceFailureCounts {
  readonly aria: number;
  readonly map: number;
  readonly eval: number;
}

export function evidenceFailureCounts(outcomes: readonly CaptureOutcome[]): EvidenceFailureCounts {
  return {
    aria: outcomes.filter((outcome) => outcome.ariaError !== null).length,
    map: outcomes.filter((outcome) => outcome.mapError !== null).length,
    eval: outcomes.reduce((count, outcome) => count + outcome.evalResults.filter((entry) => entry.failed).length, 0),
  };
}

export function hasSnapFailure(summary: SnapFailureSummary): boolean {
  return Object.values(summary).some((count) => count > 0);
}

interface OutcomeTotals {
  readonly navigation: number;
  readonly navActions: number;
  readonly steps: number;
  readonly contrast: number;
  readonly assertions: number;
  readonly deadCss: number;
  readonly emptyCss: number;
  readonly evals: number;
  readonly ariaSeen: boolean;
  readonly mapped: CaptureOutcome | undefined;
}

export function mapOutputSummary(enabled: boolean, outcomes: readonly CaptureOutcome[]): { readonly count: string; readonly domFallbacks: string } {
  if (!enabled) {
    return { count: "no", domFallbacks: "no" };
  }
  const entries = outcomes.find((outcome) => outcome.mapResult !== null)?.mapResult ?? [];
  return {
    count: String(entries.length),
    domFallbacks: String(entries.filter((entry) => entry.source === "dom").length),
  };
}

export function outcomeTotals(outcomes: readonly CaptureOutcome[]): OutcomeTotals {
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
    contrast: outcomes.reduce((count, outcome) => count + outcome.contrastResults.filter((entry) => entry.failed).length, 0),
    assertions: outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0),
    deadCss: outcomes.reduce((count, outcome) => count + outcome.deadCss.length, 0),
    emptyCss: outcomes.reduce((count, outcome) => count + outcome.emptyCss.length, 0),
    evals: outcomes.reduce((count, outcome) => count + outcome.evalResults.length, 0),
    ariaSeen: outcomes.some((outcome) => outcome.ariaText !== null),
    mapped: outcomes.find((outcome) => outcome.mapResult !== null || outcome.mapError !== null),
  };
}

interface FailureSummaryInput {
  readonly outcomes: readonly CaptureOutcome[];
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly consoleMessages: readonly CapturedConsole[];
  readonly strictConsole: boolean;
  readonly watch?: number;
  readonly diff?: number;
  readonly environment?: number;
  readonly appearance?: number;
}

export function buildFailureSummary(input: FailureSummaryInput): SnapFailureSummary {
  const totals = outcomeTotals(input.outcomes);
  const evidence = evidenceFailureCounts(input.outcomes);
  const console = consoleFailureCounts(input.consoleMessages, input.strictConsole);
  return {
    navigation: totals.navigation,
    navActions: totals.navActions,
    pageErrors: input.pageErrors,
    failedRequests: input.failedRequests,
    steps: totals.steps,
    contrast: totals.contrast,
    aria: evidence.aria,
    map: evidence.map,
    eval: evidence.eval,
    watch: input.watch ?? 0,
    diff: input.diff ?? 0,
    assertions: totals.assertions,
    consoleErrors: console.errors,
    consoleWarnings: console.warnings,
    css: input.outcomes.filter((outcome) => outcome.cssEvidence?.status === "instrument-error" || (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0).length,
    deadCss: totals.deadCss,
    emptyCss: totals.emptyCss,
    environment: input.environment ?? 0,
    appearance: input.appearance ?? 0,
  };
}
