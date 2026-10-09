// Matrix-only ruling for the one reduced mobile entry whose correct product behavior is no animation.
// Ordinary motion-audit zero-frame law stays untouched: this exception earns STATIC-EXPECTED only through
// exact app/OS/device identity and a paired full-motion interaction that proves the trace can see frames.

import { actualDeviceLabel, MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { TimingEvidencePolicy } from "../../_shared/timing-capability.ts";
import type { AuditData } from "../contract/types.ts";
import type { MotionMatrixVariant, MotionStaticExpectedLink } from "./matrix-contract.ts";
import { evaluateMotionAudit } from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --matrix --motion");

export interface MotionMatrixCellEvidence {
  readonly id: string;
  readonly code: number;
  readonly variant: MotionMatrixVariant;
  readonly data: AuditData | null;
  readonly route: string;
  readonly windowMs: number;
  readonly throttle: boolean;
  readonly timingPolicy: TimingEvidencePolicy;
}

export interface MotionStaticExpectedVerdict {
  readonly status: "ordinary" | "static-expected" | "instrument-error";
  readonly candidateCode: number;
  readonly candidateId: string;
  readonly controlId: string;
  readonly detail: string;
}

function exactApplicationMotion(data: AuditData, expected: boolean): boolean {
  const evidence = data.applicationMotion;
  return (
    evidence !== null &&
    evidence.requested === expected &&
    evidence.applied === true &&
    evidence.reached === 1 &&
    evidence.samples.length === 1 &&
    evidence.samples[0] === String(expected)
  );
}

function exactMobileEnvironment(data: AuditData, reducedMotion: boolean): boolean {
  const { environment } = data;
  return (
    environment.mismatches.length === 0 &&
    environment.requested.device === MOBILE_DEVICE &&
    environment.requested.reducedMotion === reducedMotion &&
    environment.applied.device === MOBILE_DEVICE &&
    environment.applied.reducedMotion === reducedMotion &&
    environment.applied.isMobile &&
    environment.applied.hasTouch &&
    actualDeviceLabel(environment.actual.device) === MOBILE_DEVICE &&
    environment.actual.reducedMotion === reducedMotion &&
    environment.actual.isMobile === true &&
    environment.actual.pointer === "coarse" &&
    environment.actual.hover === "none" &&
    environment.actual.maxTouchPoints > 0
  );
}

function zeroFramePopulation(data: AuditData): boolean {
  return (
    data.frames.raw.total === 0 &&
    data.frames.raw.dropped === 0 &&
    data.frames.raw.pct === null &&
    data.frames.classified.total === 0 &&
    data.frames.classified.dropped === 0 &&
    data.frames.budgeted.total === 0 &&
    data.frames.budgeted.dropped === 0 &&
    data.frames.budgeted.pct === null
  );
}

function baseEvidenceIsPresent(data: AuditData): boolean {
  return data.motion !== null && data.traceEventCount > 0 && data.pageErrors.length === 0 && !data.stepFailed && data.reachFailures === 0;
}

function instrumentError(link: MotionStaticExpectedLink, detail: string): MotionStaticExpectedVerdict {
  return {
    status: "instrument-error",
    candidateCode: EXIT.toolError,
    candidateId: link.candidateId,
    controlId: link.controlId,
    detail,
  };
}

/** Classify the one ruled candidate. Any other zero-frame cell retains ordinary EXIT.toolError. */
export function evaluateMotionStaticExpected(link: MotionStaticExpectedLink, cells: readonly MotionMatrixCellEvidence[]): MotionStaticExpectedVerdict {
  const candidate = cells.find((cell) => cell.id === link.candidateId);
  const control = cells.find((cell) => cell.id === link.controlId);
  if (candidate === undefined || candidate.data === null) {
    return instrumentError(link, "reduced-static candidate receipt is absent");
  }
  if (candidate.data.frames.raw.total > 0) {
    return {
      status: "ordinary",
      candidateCode: candidate.code,
      candidateId: link.candidateId,
      controlId: link.controlId,
      detail: "candidate produced frames and keeps the ordinary verdict",
    };
  }
  if (control === undefined || control.data === null) {
    return instrumentError(link, "full-motion mobile control receipt is absent");
  }
  if (
    candidate.variant.selector !== null ||
    !candidate.variant.appReducedMotion ||
    !candidate.variant.osReducedMotion ||
    candidate.variant.device !== MOBILE_DEVICE ||
    control.variant.selector === null ||
    control.variant.appReducedMotion ||
    control.variant.osReducedMotion ||
    control.variant.device !== MOBILE_DEVICE
  ) {
    return instrumentError(link, "candidate/control variant identity is counterfeit");
  }
  if (
    candidate.route !== control.route ||
    candidate.windowMs !== control.windowMs ||
    candidate.throttle !== control.throttle ||
    !exactApplicationMotion(candidate.data, true) ||
    !exactApplicationMotion(control.data, false) ||
    !exactMobileEnvironment(candidate.data, true) ||
    !exactMobileEnvironment(control.data, false)
  ) {
    return instrumentError(link, "candidate/control requested-applied-runtime identity does not reconcile");
  }
  const candidateEvaluation = evaluateMotionAudit(candidate.data, candidate.windowMs, candidate.timingPolicy);
  const nonFrameGaps = candidateEvaluation.gaps.filter((gap) => gap.evidence !== "the frame population");
  if (
    !(zeroFramePopulation(candidate.data) && baseEvidenceIsPresent(candidate.data)) ||
    candidate.data.animations.length > 0 ||
    !candidateEvaluation.budgetsPass ||
    candidateEvaluation.gaps.length !== 1 ||
    nonFrameGaps.length > 0
  ) {
    return instrumentError(link, "reduced-static candidate has evidence or budget gaps beyond the frame population");
  }
  if (!baseEvidenceIsPresent(control.data) || control.data.frames.raw.total <= 0 || control.data.frames.raw.pct === null || control.code === EXIT.toolError) {
    return instrumentError(link, "full-motion mobile control did not prove a nonzero trace/frame population");
  }
  return {
    status: "static-expected",
    candidateCode: EXIT.clean,
    candidateId: link.candidateId,
    controlId: link.controlId,
    detail: "STATIC-EXPECTED: exact reduced mobile entry produced no motion beside a live full-motion mobile interaction control",
  };
}
