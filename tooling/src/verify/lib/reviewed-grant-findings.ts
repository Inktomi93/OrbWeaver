// The one place a `reviewed-grant` policy turns candidate occurrences into findings.
//
// WHY IT IS SHARED AND WHY IT DEDUPES. A reviewed grant is keyed on `(policyId, subject, operation)`, and
// central reconciliation calls a row that matches MORE THAN ONE finding OVER-BROAD — it then licenses
// NOTHING (`lib/gate-authority.ts`). So a home that performs the same licensed operation at three call
// sites would, occurrence-by-occurrence, make its own permission unrepresentable. Finding granularity must
// therefore EQUAL grant granularity: exactly one finding per `(subject, operation)`, with every site listed
// in the message so the fix still points at the code. This is the reviewed-grant twin of the ordinary
// engine's rule that a positioned marker suppresses only when exactly one finding sits in its carrier.
//
// The recorded cost is a slight under-report: a file with two illegal occurrences of the SAME operation
// reports once. The finding still fires, its message names both sites, and the fix addresses both.
import type { Node as MorphNode } from "ts-morph";
import type { GatePolicyReportSink } from "../contract/policy.ts";

export interface ReviewedGrantCandidate {
  /** The node the finding is anchored on. The first candidate of a group wins, so callers push in walk order. */
  readonly node: MorphNode;
  /** The grant subject — always the repo-relative path of the file the occurrence lives in. */
  readonly subject: string;
  /** The grant operation — the licensed act, stable across edits to the file. */
  readonly operation: string;
  /** True when the identity could not be read at all: reported rather than passed, with its own message. */
  readonly unreadable?: boolean;
  readonly token?: string;
  readonly offset?: number;
}

export interface ReviewedGrantReport {
  readonly message: string;
  readonly fix: string;
  /** The message for a group whose every candidate was unreadable. */
  readonly unreadableMessage: string;
}

function siteList(candidates: readonly ReviewedGrantCandidate[]): string {
  return [...new Set(candidates.map((candidate) => candidate.node.getStartLineNumber()))].toSorted((left, right) => left - right).join(", ");
}

/** Group candidates by their grant identity and report exactly one finding per group, in stable order. */
export function reportReviewedGrantCandidates(report: GatePolicyReportSink, candidates: readonly ReviewedGrantCandidate[], text: ReviewedGrantReport): void {
  const groups = new Map<string, ReviewedGrantCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.subject} ${candidate.operation}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const [, group] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    const [first] = group;
    if (first === undefined) {
      continue;
    }
    const proven = group.filter((candidate) => candidate.unreadable !== true);
    const anchor = proven[0] ?? first;
    const base = proven.length === 0 ? text.unreadableMessage : text.message;
    report.node(anchor.node, {
      subject: first.subject,
      operation: first.operation,
      message: `${base} Subject: ${first.subject}, operation: ${first.operation}, line(s): ${siteList(group)}.`,
      fix: text.fix,
      ...(anchor.token === undefined || anchor.offset === undefined ? {} : { token: anchor.token, offset: anchor.offset }),
    });
  }
}
