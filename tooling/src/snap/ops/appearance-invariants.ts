// One strict reconciler for #953's literal client-owned rows. It does not discover subjects or invent
// expectations: it rejects any receipt that is not an exact accounting/judgment of the live contract.

import type { RuntimeAppearanceHistoricalCascade, RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  AppearanceCascadeExpectation,
  AppearanceInvariantEvaluation,
  AppearanceInvariantReceipt,
  AppearancePopulationAccounting,
  AppearanceSubjectReceipt,
} from "../contract/appearance-invariants.ts";
import type { CssCascadeDeclaration, CssCascadeReceipt } from "../contract/cascade.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function skippedTotal(accounting: AppearancePopulationAccounting): number {
  return accounting.skipped.reduce((sum, row) => sum + row.count, 0);
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Count equality is insufficient for historical rows: a replacement row with the same population must
 * still fail membership before the matrix can claim all ruled obligations ran. */
export function sameAppearanceReceiptPopulation(expectedRows: readonly string[], actualRows: readonly string[]): boolean {
  const counts = (values: readonly string[]): Map<string, number> => {
    const result = new Map<string, number>();
    for (const value of values) {
      result.set(value, (result.get(value) ?? 0) + 1);
    }
    return result;
  };
  const expected = counts(expectedRows);
  const actual = counts(actualRows);
  return expected.size === actual.size && [...expected].every(([id, count]) => actual.get(id) === count);
}

function reconcileAccounting(label: string, accounting: AppearancePopulationAccounting, errors: string[]): void {
  const counts = [accounting.declared, accounting.candidates, accounting.reached, accounting.sampled, accounting.occluded, accounting.offViewport];
  if (counts.some((count) => !validCount(count)) || accounting.skipped.some((row) => row.reason.length === 0 || !validCount(row.count) || row.count === 0)) {
    errors.push(`${label} contains an invalid population count or skip reason`);
    return;
  }
  const skipped = skippedTotal(accounting);
  if (accounting.candidates !== accounting.reached + skipped) {
    errors.push(`${label} candidates=${accounting.candidates} does not reconcile with reached=${accounting.reached} + skipped=${skipped}`);
  }
  if (accounting.reached !== accounting.sampled + accounting.occluded + accounting.offViewport) {
    errors.push(
      `${label} reached=${accounting.reached} does not reconcile with sampled=${accounting.sampled} + occluded=${accounting.occluded} + offViewport=${accounting.offViewport}`,
    );
  }
}

function summedSubjectAccounting(subjects: readonly AppearanceSubjectReceipt[]): AppearancePopulationAccounting {
  return {
    declared: subjects.reduce((sum, subject) => sum + subject.accounting.declared, 0),
    candidates: subjects.reduce((sum, subject) => sum + subject.accounting.candidates, 0),
    reached: subjects.reduce((sum, subject) => sum + subject.accounting.reached, 0),
    sampled: subjects.reduce((sum, subject) => sum + subject.accounting.sampled, 0),
    skipped: subjects.flatMap((subject) => subject.accounting.skipped),
    occluded: subjects.reduce((sum, subject) => sum + subject.accounting.occluded, 0),
    offViewport: subjects.reduce((sum, subject) => sum + subject.accounting.offViewport, 0),
  };
}

function compareAccounting(expected: AppearancePopulationAccounting, actual: AppearancePopulationAccounting, errors: string[]): void {
  for (const key of ["declared", "candidates", "reached", "sampled", "occluded", "offViewport"] as const) {
    if (actual[key] !== expected[key]) {
      errors.push(`row accounting ${key}=${actual[key]} does not equal subject sum ${expected[key]}`);
    }
  }
  if (skippedTotal(actual) !== skippedTotal(expected)) {
    errors.push(`row accounting skipped=${skippedTotal(actual)} does not equal subject sum ${skippedTotal(expected)}`);
  }
}

function activeDeclaration(receipt: CssCascadeReceipt, expectedSource: string): CssCascadeDeclaration | undefined {
  return receipt.status === "ok"
    ? receipt.declarations.find((declaration) => declaration.state === "Active" && declaration.source === expectedSource)
    : undefined;
}

interface EvaluationSink {
  readonly errors: string[];
  readonly violations: string[];
}

function evaluateCascadeRow(
  policy: RuntimeAppearanceHistoricalCascade | undefined,
  expected: AppearanceCascadeExpectation,
  actual: CssCascadeReceipt | undefined,
  sink: EvaluationSink,
): void {
  const { errors, violations } = sink;
  if (policy === undefined || !policy.sources.includes(expected.expectedSource)) {
    errors.push(`cascade expectation is outside policy: ${expected.selector}=${expected.property} source=${expected.expectedSource}`);
    return;
  }
  const requiredOverloaded = policy.overloadedSources ?? [];
  if (
    expected.expectedOverloadedSources.length !== requiredOverloaded.length ||
    requiredOverloaded.some((source) => !expected.expectedOverloadedSources.includes(source))
  ) {
    errors.push(`cascade overloaded-source expectation is outside policy: ${expected.selector}=${expected.property}`);
    return;
  }
  if (actual === undefined || actual.status !== "ok") {
    errors.push(`cascade evidence is missing for ${expected.selector}=${expected.property}`);
    return;
  }
  if (actual.computedValue !== expected.expectedValue) {
    violations.push(`cascade value mismatch for ${expected.selector}=${expected.property}: expected=${expected.expectedValue} actual=${actual.computedValue}`);
  }
  if (activeDeclaration(actual, expected.expectedSource) === undefined) {
    violations.push(`cascade Active source mismatch for ${expected.selector}=${expected.property}: expected=${expected.expectedSource}`);
  }
  for (const source of expected.expectedOverloadedSources) {
    if (!actual.declarations.some((declaration) => declaration.state === "Overloaded" && declaration.source === source)) {
      violations.push(`cascade Overloaded source missing for ${expected.selector}=${expected.property}: expected=${source}`);
    }
  }
}

function evaluateCascade(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  if (receipt.css.status !== "ok") {
    errors.push(`CSS evidence is ${receipt.css.status}: ${receipt.css.error ?? "unknown"}`);
    return;
  }
  if (receipt.cascade.length !== policy.cascade.length) {
    errors.push(`cascade expectation population=${receipt.cascade.length} does not equal policy=${policy.cascade.length}`);
    return;
  }
  for (const expected of receipt.cascade) {
    const policyRow = policy.cascade.find((row) => row.selector === expected.selector && row.property === expected.property);
    const actual = receipt.css.cascade.find((row) => row.selector === expected.selector && row.property === expected.property);
    evaluateCascadeRow(policyRow, expected, actual, { errors, violations });
  }
}

interface MergeConflictShape {
  readonly axis?: unknown;
  readonly loser?: { readonly className?: unknown };
  readonly winner?: { readonly className?: unknown };
}

interface MergeReceiptShape {
  readonly output?: unknown;
  readonly conflicts?: readonly MergeConflictShape[];
}

function evaluateMerge(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  if (policy.merge.mechanism === "merge-not-applicable") {
    if (receipt.merge.mechanism !== "merge-not-applicable" || receipt.merge.selector !== policy.merge.selector || receipt.merge.owner !== policy.merge.owner) {
      errors.push(`direct-carrier merge N/A receipt is invalid for ${policy.id}`);
    }
    return;
  }
  if (receipt.merge.mechanism !== "merge-required" || receipt.merge.selector !== policy.merge.selector || receipt.merge.owner !== policy.merge.owner) {
    errors.push(`merge policy mismatch for ${policy.id}`);
    return;
  }
  if (receipt.merge.expectedOutput.length === 0) {
    errors.push(`merge-required receipt omitted an expected output for ${policy.id}`);
    return;
  }
  const requiredPolicy = policy.merge;
  const requiredReceipt = receipt.merge;
  const trace = receipt.css.merge as { readonly status?: unknown; readonly calls?: unknown; readonly receipts?: unknown } | null;
  if (trace === null || trace.status !== "ok" || !Number.isSafeInteger(trace.calls) || (trace.calls as number) <= 0 || !Array.isArray(trace.receipts)) {
    errors.push(`configured merge trace is absent or invalid for ${policy.id}`);
    return;
  }
  const matched = (trace.receipts as MergeReceiptShape[]).some(
    (candidate) =>
      candidate.output === requiredReceipt.expectedOutput &&
      Array.isArray(candidate.conflicts) &&
      candidate.conflicts.some(
        (conflict) =>
          conflict.axis === requiredPolicy.conflict.axis &&
          conflict.loser?.className === requiredPolicy.conflict.loser &&
          conflict.winner?.className === requiredPolicy.conflict.winner,
      ),
  );
  if (!matched) {
    violations.push(
      `configured merge winner missing for ${requiredPolicy.selector}: ${requiredPolicy.conflict.axis} ${requiredPolicy.conflict.loser}->${requiredPolicy.conflict.winner}`,
    );
  }
}

function evaluateSubjects(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  const policySubjects = new Map(policy.subjects.map((subject) => [subject.id, subject]));
  if (receipt.subjects.length !== policy.subjects.length || new Set(receipt.subjects.map((subject) => subject.id)).size !== receipt.subjects.length) {
    errors.push(`subject population=${receipt.subjects.length} does not equal unique policy population=${policy.subjects.length}`);
  }
  for (const subject of receipt.subjects) {
    const expected = policySubjects.get(subject.id);
    if (expected === undefined || expected.selector !== subject.selector) {
      errors.push(`subject ${subject.id} selector is outside the client policy`);
      continue;
    }
    reconcileAccounting(`subject ${subject.id}`, subject.accounting, errors);
    const optionalAbsent = policy.optionalSubjectIds.includes(subject.id) && subject.accounting.candidates === 0;
    const incompleteSingleton =
      expected.population === "one" &&
      (subject.accounting.candidates !== 1 ||
        subject.accounting.sampled !== 1 ||
        skippedTotal(subject.accounting) > 0 ||
        subject.accounting.occluded > 0 ||
        subject.accounting.offViewport > 0);
    if (
      subject.accounting.declared !== 1 ||
      (!optionalAbsent && (subject.accounting.candidates === 0 || subject.accounting.sampled === 0 || incompleteSingleton))
    ) {
      violations.push(`required subject ${subject.id} was not fully reached and sampled`);
    }
  }
}

function evaluateChecks(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  const checkIds = receipt.checks.map((check) => check.id);
  if (
    checkIds.length !== policy.requiredChecks.length ||
    new Set(checkIds).size !== checkIds.length ||
    policy.requiredChecks.some((id) => !checkIds.includes(id))
  ) {
    errors.push(`semantic check population does not exactly match policy for ${policy.id}`);
  }
  for (const check of receipt.checks) {
    if (check.expected.length === 0 || check.actual.length === 0) {
      errors.push(`semantic check ${check.id} omitted expected or actual evidence`);
    } else if (!check.passed) {
      violations.push(`semantic check ${check.id} failed: expected=${check.expected} actual=${check.actual}`);
    }
  }
}

function evaluatePixels(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  const requiredSelectors = policy.subjects.filter((subject) => subject.sample === "pixel").map((subject) => subject.selector);
  const receivedSelectors = receipt.pixels.map((pixel) => pixel.selector);
  if (
    receipt.pixels.length !== requiredSelectors.length ||
    new Set(receivedSelectors).size !== receivedSelectors.length ||
    requiredSelectors.some((selector) => !receivedSelectors.includes(selector))
  ) {
    errors.push(`pixel population=${receipt.pixels.length} does not exactly match required population=${requiredSelectors.length}`);
  }
  for (const pixel of receipt.pixels) {
    if (!requiredSelectors.includes(pixel.selector)) {
      errors.push(`pixel selector ${pixel.selector} is outside the client policy`);
      continue;
    }
    const numericCounts = [pixel.candidates, pixel.inViewport, pixel.sampled];
    if (numericCounts.some((count) => !validCount(count)) || pixel.candidates <= 0 || pixel.inViewport <= 0 || pixel.sampled !== 1) {
      errors.push(`pixel selector ${pixel.selector} has an invalid or empty sampled population`);
    }
    if (pixel.status !== "ok" || pixel.method !== "pixel-sample" || pixel.matchIndex === null || pixel.ratio === null || pixel.requiredRatio === null) {
      errors.push(`pixel selector ${pixel.selector} lacks a composited framebuffer verdict`);
    } else if (pixel.passed !== true || pixel.ratio < pixel.requiredRatio) {
      violations.push(`pixel selector ${pixel.selector} contrast=${pixel.ratio} is below required=${pixel.requiredRatio}`);
    }
  }
}

function evaluationStatus(errors: readonly string[], violations: readonly string[]): AppearanceInvariantEvaluation["status"] {
  if (errors.length > 0) {
    return "instrument-error";
  }
  return violations.length > 0 ? "violations" : "ok";
}

function evaluateDeadCss(receipt: AppearanceInvariantReceipt, errors: string[], violations: string[]): void {
  const evidence = receipt.deadCss;
  if (evidence.sheets <= 0 || evidence.readableSheets <= 0 || evidence.rules <= 0 || evidence.defined <= 0 || evidence.used <= 0) {
    errors.push("dead-CSS census has a zero denominator");
  }
  if (evidence.unreadable.length > 0 || evidence.drain === null || evidence.drain.completedGeneration < evidence.drain.requestedGeneration) {
    errors.push("dead-CSS census has unreadable sheets or an unsettled drain");
  }
  if (evidence.dead.length > 0) {
    violations.push(`dead CSS identities: ${evidence.dead.map((row) => row.token).join(",")}`);
  }
  if (evidence.empty.length > 0) {
    violations.push(`empty CSS identities: ${evidence.empty.join(",")}`);
  }
}

export function evaluateAppearanceInvariantCell(policy: RuntimeAppearanceHistoricalRow, receipt: AppearanceInvariantReceipt): AppearanceInvariantEvaluation {
  const errors: string[] = [];
  const violations: string[] = [];
  if (receipt.rowId !== policy.id) {
    errors.push(`receipt row=${receipt.rowId} does not equal policy=${policy.id}`);
  }
  evaluateSubjects(policy, receipt, errors, violations);
  reconcileAccounting("row", receipt.accounting, errors);
  const summed = summedSubjectAccounting(receipt.subjects);
  compareAccounting(summed, receipt.accounting, errors);
  evaluateChecks(policy, receipt, errors, violations);
  evaluatePixels(policy, receipt, errors, violations);
  evaluateDeadCss(receipt, errors, violations);
  evaluateCascade(policy, receipt, errors, violations);
  evaluateMerge(policy, receipt, errors, violations);
  return {
    status: evaluationStatus(errors, violations),
    errors,
    violations,
    accounting: receipt.accounting,
    mergeRequired: Number(policy.merge.mechanism === "merge-required"),
    mergeDirectCarrier: Number(policy.merge.mechanism === "merge-not-applicable"),
  };
}
