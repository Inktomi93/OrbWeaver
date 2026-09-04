// Analyzer-owned problem rows for the Snap design-audit artifact — the `--report … --problems` reader's
// browser-free view of what the walk found (the `lib/motion-problems.ts` shape, one arm over).
//
// SEVERITY POLICY STAYS WITH THE RULE ENGINE. Nothing here re-derives a threshold: a finding already
// carries its rule, severity, selector and measured value, and `--fail-on` is the run's own boundary, so
// each row restates the verdict rather than recomputing it. That is the whole contract of an analyzer
// problem row (contract/analyzer.ts): the writer owns the policy, the reader renders the fact.
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { Finding, Severity } from "../../ui-audit/index.ts";
import type { SnapAnalyzerProblem } from "../contract/analyzer.ts";
import type { SelectorProof } from "../ops/design-audit-walk.ts";

function gapProblems(gaps: readonly EvidenceGap[]): SnapAnalyzerProblem[] {
  return gaps.map((gap) => ({
    arm: "design-audit",
    kind: "evidence-gap",
    metric: gap.evidence,
    subject: "the audited surface",
    observed: "absent",
    threshold: "required",
    detail: gap.detail,
  }));
}

function findingProblems(findings: readonly Finding[], failOn: Severity): SnapAnalyzerProblem[] {
  return findings.map((finding) => ({
    arm: "design-audit",
    kind: "threshold",
    metric: finding.rule,
    subject: finding.selector,
    observed: `${finding.severity} ${finding.value}`,
    threshold: failOn,
    detail: finding.message,
  }));
}

/** A finding whose selector does not resolve to exactly one element is still a finding — it is a finding
 *  nobody can OPEN (#1326). It rides as its own row rather than reddening the surface's verdict, because
 *  the defect it names belongs to the instrument, not to the app. `-1` is the selector the browser
 *  refused to parse: unproven, never quietly unique. */
function selectorProblems(proofs: readonly SelectorProof[]): SnapAnalyzerProblem[] {
  return proofs
    .filter((proof) => proof.matches !== 1)
    .map((proof) => ({
      arm: "design-audit",
      kind: "failure",
      metric: "finding-selector-uniqueness",
      subject: proof.selector,
      observed: proof.matches === -1 ? "unparseable" : `${String(proof.matches)} matches`,
      threshold: "exactly 1 match",
      detail:
        proof.matches === -1
          ? "the emitted finding selector is not a selector this browser can parse, so the row cannot be reopened"
          : "the emitted finding selector does not identify one element, so the row names a defect a reader cannot locate (ops/walker/core.ts describe())",
    }));
}

export function designAuditProblems(
  input: Readonly<{
    findings: readonly Finding[];
    gaps: readonly EvidenceGap[];
    failOn: Severity;
    selectorProof: readonly SelectorProof[];
  }>,
): readonly SnapAnalyzerProblem[] {
  return [...gapProblems(input.gaps), ...findingProblems(input.findings, input.failOn), ...selectorProblems(input.selectorProof)];
}
