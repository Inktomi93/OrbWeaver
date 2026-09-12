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
//
// TWO ANCHOR KINDS, ONE LAW (added 2026-09-12 with the `suppressions` authority migration, #2063). The
// grouping and ordering live in ONE private function; the exported doors differ only in what they can anchor
// on. `reportReviewedGrantCandidates` anchors on a NODE and is what a policy judging code uses.
// `reportReviewedGrantFileCandidates` anchors on a FILE and LINE, for a policy whose occurrences have no
// node to report — `suppressions` judges COMMENT TRIVIA, and `lib/suppression-directive.ts` deliberately
// walks raw comment ranges "without wrapping — or even synthesising — a single token (#967)", so there is
// no `MorphNode` for it to hand over. Splitting the law into two implementations was the alternative and is
// exactly what this module exists to prevent.
//
// `subject` IS THE GRANT IDENTITY, NOT NECESSARILY A PATH. Every node-anchored consumer today grants per
// FILE, so its subject is the repo-relative path of the file the occurrence lives in. `suppressions` grants
// per RULE CLASS — "the snake_case key IS the wire protocol" is a ruling about a biome rule repository-wide,
// not about any one file — so its subject is the rule id and its operation is the governed scope. Both are
// legal: the pair is whatever identity `lib/reviewed-grants.ts` licenses, and the ONLY invariant this module
// enforces is that the policy's findings are grouped by it exactly as central reconciliation matches on it.
import type { Node as MorphNode } from "ts-morph";
import type { GatePolicyReportSink } from "../contract/policy.ts";

/** The identity half both anchor kinds share — the pair central reconciliation matches a grant on. */
interface ReviewedGrantIdentity {
  /** The grant SUBJECT. A repo-relative file path for every occurrence-in-a-file consumer; a rule-class
   *  identity for a class-wide ruling (`suppressions`). See the header — this field is the grant identity,
   *  not a path by contract. */
  readonly subject: string;
  /** The grant operation — the licensed act, stable across edits to the subject. */
  readonly operation: string;
}

export interface ReviewedGrantCandidate extends ReviewedGrantIdentity {
  /** The node the finding is anchored on. The first candidate of a group wins, so callers push in walk order. */
  readonly node: MorphNode;
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

/** ONE grouping, shared by both anchor kinds: bucket by `(subject, operation)` — the exact key
 *  `lib/gate-authority.ts` matches a grant on — and hand the buckets back in stable key order. THE LAW LIVES
 *  HERE AND NOWHERE ELSE; the exported doors below differ only in what they can anchor a finding on. */
function groupByGrantIdentity<Candidate extends ReviewedGrantIdentity>(candidates: readonly Candidate[]): readonly (readonly Candidate[])[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.subject} ${candidate.operation}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return [...groups].toSorted(([left], [right]) => left.localeCompare(right)).map(([, group]) => group);
}

function siteList(candidates: readonly ReviewedGrantCandidate[]): string {
  return [...new Set(candidates.map((candidate) => candidate.node.getStartLineNumber()))].toSorted((left, right) => left - right).join(", ");
}

/** Group candidates by their grant identity and report exactly one finding per group, in stable order. */
export function reportReviewedGrantCandidates(report: GatePolicyReportSink, candidates: readonly ReviewedGrantCandidate[], text: ReviewedGrantReport): void {
  for (const group of groupByGrantIdentity(candidates)) {
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

/** One occurrence with no node to anchor on — a comment directive, a resource row, anything the policy reads
 *  outside the AST it can report against. `file` MUST be inside the policy's effective population or
 *  `report.file` refuses it. */
export interface ReviewedGrantFileCandidate extends ReviewedGrantIdentity {
  /** Repo-relative path of the file the occurrence lives in. Unlike the node door, a single group's sites may
   *  span MANY files, because the subject need not be the file (see the header). */
  readonly file: string;
  readonly line: number;
  /** An optional per-site discriminator rendered beside the coordinate — the exact directive token, a row
   *  key. It is what lets one message distinguish two occurrences that share a subject. */
  readonly note?: string;
  /** True when the identity could not be read at all: reported rather than passed, with its own message. */
  readonly unreadable?: boolean;
}

/** The site list, in the caller's PATH/LINE order. It must NOT re-sort: the only ordering available to a
 *  rendered `file:line` string is lexical, and lexically `…:10` precedes `…:2`, so a class with sites at
 *  lines 2 and 10 in one file named them out of order (#2135). `reportReviewedGrantFileCandidates` already
 *  computes the correct order numerically — this renders THAT array and only dedupes, which is load-bearing
 *  because two occurrences can share a coordinate and a note. */
function fileSiteList(candidates: readonly ReviewedGrantFileCandidate[]): string {
  const rendered = candidates.map((candidate) => `${candidate.file}:${candidate.line}${candidate.note === undefined ? "" : ` (${candidate.note})`}`);
  return [...new Set(rendered)].join(", ");
}

/** The FILE-anchored door over the same law: one finding per `(subject, operation)`, anchored at the first
 *  site in path/line order, every site named in the message. */
export function reportReviewedGrantFileCandidates(
  report: GatePolicyReportSink,
  candidates: readonly ReviewedGrantFileCandidate[],
  text: ReviewedGrantReport,
): void {
  for (const group of groupByGrantIdentity(candidates)) {
    const ordered = group.toSorted((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
    const [first] = ordered;
    if (first === undefined) {
      continue;
    }
    const proven = ordered.filter((candidate) => candidate.unreadable !== true);
    const anchor = proven[0] ?? first;
    const base = proven.length === 0 ? text.unreadableMessage : text.message;
    report.file(anchor.file, {
      line: anchor.line,
      column: 1,
      subject: first.subject,
      operation: first.operation,
      message: `${base} Subject: ${first.subject}, operation: ${first.operation}, site(s): ${fileSiteList(ordered)}.`,
      fix: text.fix,
    });
  }
}
