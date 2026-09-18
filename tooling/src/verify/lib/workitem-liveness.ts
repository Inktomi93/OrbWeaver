// WARNING-DEBT `workItem` VOCABULARY AND DERIVATION (#2070) — the ONE class of board citation that claims
// OPENNESS, split from the judgment that reconciles all three classes (`lib/board-citations.ts`) when
// \#2156 folded this row into its superset verb.
//
// THE CLAIM. A warning-tier policy's `workItem` says a board row is OPEN and owns the debt;
// `lib/policy-validation.ts:426-433` proves only that the number is an own enumerable positive safe
// integer. Nothing asked the board until this landed, and the claim had gone stale three times:
// `over-art-plate-arm` pointed at CLOSED #626, was repointed at #2024 (`17a495fb8`) and #2024 CLOSED the
// same day on that repoint receipt; `policy-refusal-coverage` was born pointing at #2184, which closed on
// the module's LANDING while its own flip event — "the commit that takes THIS POLICY'S OWN EFFECTIVE COUNT
// TO ZERO" — had 17 findings still to drain. Both now name live owners (#2326, #2327).
//
// WHY THIS IS NOT A GATE, and the ruling is owner-approved, not a preference (forge #2111, recorded on
// \#2070 2026-09-12): the question needs the BOARD, and guide §12.3 bans every I/O door from a policy. The
// honest home is a barrier verb run beside `ledgers:fresh` at a quiet barrier — never the commit bar,
// which must stay offline-capable.
import type { GatePolicy } from "../contract/policy.ts";

/** The two states the board reports for an issue. */
// @orb-waive no-inline-types(BoardIssueState): consumed within the board/citation lib/ cluster only; not a cross-domain shape; ends when a gate imports it
export type BoardIssueState = "OPEN" | "CLOSED";

/** One warning policy and the board row it claims owns its debt. */
export interface WorkItemCitation {
  readonly policy: string;
  readonly workItem: number;
}

/** ISSUE #1, `Migrate documentation into an evidence-backed control plane`, CLOSED as COMPLETED — the
 *  repository's first row, from the doc-migration era that predates every gate in this corpus. It is the
 *  SAME-INVOCATION POSITIVE CONTROL every board read is judged against, chosen for being the least
 *  reopenable row on the board rather than for its subject, and the choice is self-announcing: should
 *  anyone reopen it, the run REFUSES (exit 2) naming this constant, which is louder than any silent drift
 *  the control was placed to catch.
 *
 *  WHY A CLOSED CONTROL AND NOT AN OPEN ONE. Every way a board reader breaks — an unparsed payload, a
 *  defaulted field, a stubbed call — yields `OPEN` (or "unknown") for every row, which reads exactly like
 *  a clean bar. A reader stuck on `CLOSED` reds every citation at once and is self-announcing; a reader
 *  stuck on `OPEN` is silent, and silence is what this control buys. */
export const CLOSED_CONTROL_ISSUE = 1;

/** The warning-tier citations of a loaded corpus. The severity union (`contract/policy.ts`) makes this
 *  total: `workItem` exists exactly on the `warning` arm, so there is no undefined case to invent a
 *  default for, and the population is DERIVED from a real corpus load — never a hand roster, because the
 *  founding defect GREW while a list would have looked complete (#2070's body knows only about the first
 *  of the two carriers). */
export function warningWorkItems(policies: readonly GatePolicy[]): readonly WorkItemCitation[] {
  const citations: WorkItemCitation[] = [];
  for (const policy of policies) {
    if (policy.severity === "warning") {
      citations.push({ policy: policy.id, workItem: policy.workItem });
    }
  }
  return citations;
}
