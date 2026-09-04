// Analyzer-owned problem rows for the Snap motion artifact. This module imports the verdict engine's
// thresholds so the browser-free report never duplicates or re-derives motion policy.
import { isSanctionedLibraryAnimation } from "@orb/kit/motion-allowance";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { AuditData } from "../../motion-audit/index.ts";
import {
  BLOCKING_BUDGET_MS,
  CLS_BUDGET,
  clsBudgetBasis,
  clsBudgeted,
  DROPPED_FRAME_BUDGET_PCT,
  framePopulationBasis,
  loafTotals,
} from "../../motion-audit/index.ts";
import type { SnapAnalyzerProblem } from "../contract/analyzer.ts";

function gapProblems(gaps: readonly EvidenceGap[]): SnapAnalyzerProblem[] {
  return gaps.map((gap) => ({
    arm: "motion",
    kind: "evidence-gap",
    metric: gap.evidence,
    subject: "measurement-window",
    observed: "absent",
    threshold: "required",
    detail: gap.detail,
  }));
}

function budgetProblems(data: AuditData): SnapAnalyzerProblem[] {
  const problems: SnapAnalyzerProblem[] = [];
  const loaf = loafTotals(data.motion);
  if (loaf.budgetedWorstBlocking > BLOCKING_BUDGET_MS) {
    problems.push({
      arm: "motion",
      kind: "threshold",
      metric: "loaf-blocking-ms",
      subject: "measurement-window",
      observed: `${String(loaf.budgetedWorstBlocking)}ms`,
      threshold: `${String(BLOCKING_BUDGET_MS)}ms`,
      detail: "budgeted worst Long Animation Frame blocking duration exceeded the motion budget",
    });
  }
  if (loaf.budgetedStyleLayout > 0) {
    problems.push({
      arm: "motion",
      kind: "threshold",
      metric: "loaf-style-layout-count",
      subject: "measurement-window",
      observed: String(loaf.budgetedStyleLayout),
      threshold: "0",
      detail: "budgeted Long Animation Frames performed style/layout work",
    });
  }
  const cls = clsBudgeted(data.motion, data.measuredInput);
  if (cls !== null && cls > CLS_BUDGET) {
    problems.push({
      arm: "motion",
      kind: "threshold",
      metric: "cls",
      subject: clsBudgetBasis(data.measuredInput),
      observed: String(cls),
      threshold: String(CLS_BUDGET),
      detail: "budgeted cumulative layout shift exceeded the motion threshold",
    });
  }
  if (
    framePopulationBasis(data.frames.budgeted.total) === "verdict" &&
    data.frames.budgeted.pct !== null &&
    data.frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT
  ) {
    problems.push({
      arm: "motion",
      kind: "threshold",
      metric: "dropped-frame-percent",
      subject: `${String(data.frames.budgeted.total)} budgeted frames`,
      observed: `${String(data.frames.budgeted.pct)}%`,
      threshold: `${String(DROPPED_FRAME_BUDGET_PCT)}%`,
      detail: "dropped-frame rate exceeded the threshold over a verdict-capable population",
    });
  }
  return problems;
}

function animationProblems(data: AuditData): SnapAnalyzerProblem[] {
  const active = data.animations
    .filter((animation) => !(animation.compositorClean || isSanctionedLibraryAnimation(animation)))
    .map(
      (animation): SnapAnalyzerProblem => ({
        arm: "motion",
        kind: "threshold",
        metric: "dirty-animation",
        subject: animation.target,
        observed: animation.properties.join(",") || "unattributed",
        threshold: "compositor-only",
        detail: "active animation uses a non-compositor property",
      }),
    );
  const transient: SnapAnalyzerProblem[] = [];
  for (const flag of data.flags ?? []) {
    const animation = flag.animation;
    if (flag.tag !== "anim" || animation?.compositorClean === true || (animation !== undefined && isSanctionedLibraryAnimation(animation))) {
      continue;
    }
    transient.push({
      arm: "motion",
      kind: "threshold",
      metric: "dirty-animation",
      subject: flag.offender,
      observed: animation === undefined || animation.properties.length === 0 ? "unattributed" : animation.properties.join(","),
      threshold: "compositor-only",
      detail: `${flag.detail}; transient animation finished inside the measured window`,
    });
  }
  return [...active, ...transient];
}

function executionProblems(data: AuditData): SnapAnalyzerProblem[] {
  const problems: SnapAnalyzerProblem[] = [];
  if (data.stepFailed) {
    problems.push({
      arm: "motion",
      kind: "failure",
      metric: "measured-step",
      subject: "motion action",
      observed: "failed",
      threshold: "landed",
      detail: "the measured interaction did not land",
    });
  }
  if (data.reachFailures > 0) {
    problems.push({
      arm: "motion",
      kind: "failure",
      metric: "reach-actions",
      subject: "pre-measurement tape",
      observed: String(data.reachFailures),
      threshold: "0",
      detail: "one or more reach actions failed, so the window describes another surface",
    });
  }
  for (const error of data.pageErrors) {
    problems.push({ arm: "motion", kind: "failure", metric: "page-error", subject: "measured page", observed: "error", threshold: "none", detail: error });
  }
  return problems;
}

export function motionProblems(data: AuditData | null, gaps: readonly EvidenceGap[]): readonly SnapAnalyzerProblem[] {
  return data === null ? gapProblems(gaps) : [...gapProblems(gaps), ...budgetProblems(data), ...animationProblems(data), ...executionProblems(data)];
}
