// WARNING-DEBT `workItem` LIVENESS (#2070) — the judgment half. A warning-tier policy's `workItem` is a
// CLAIM that a board row is OPEN and owns the debt; `lib/policy-validation.ts:426-433` proves only that the
// number is an own enumerable positive safe integer. Nothing has ever asked the board. The claim has gone
// stale three times: `over-art-plate-arm` pointed at CLOSED #626, was repointed at #2024 (`17a495fb8`) and
// #2024 CLOSED the same day; `policy-refusal-coverage` was born pointing at #2184, which closed on the
// module's LANDING while its own header's flip event — "the commit that takes THIS POLICY'S OWN EFFECTIVE
// COUNT TO ZERO" — had 17 findings still to drain.
//
// WHY THIS IS NOT A GATE, and the ruling is owner-approved, not a preference (forge #2111, recorded on
// #2070 2026-09-12): the question needs the BOARD, and guide §12.3 bans every I/O door from a policy. The
// honest home is a barrier verb run beside `ledgers:fresh` at a quiet barrier — never the commit bar, which
// must stay offline-capable.
//
// WHY THE JUDGE IS A `lib/` MODULE WITH AN INJECTED READER, and not an `ops/` verb of its own. #2156 is the
// SUPERSET row and is RUNNING in lane `p-barrier`: ONE barrier verb reconciling three citation classes
// against the board — ledger closure citations, roster citations, and (class 2, citing #2070 by number)
// exactly this one. A second front door for the same board read would be a door to retire the day that verb
// lands. So the judgment, its vocabulary and its three-outcome contract live here, `readState` is a
// PARAMETER, and the network door is its own module (`lib/workitem-board-reader.ts`) — which makes every
// outcome, including the refusal, pinnable without a network.
//
// THE THREE OUTCOMES ARE THE WHOLE POINT (the repo's 0/1/2/3 contract, `_shared/exit-contract.ts`):
//   0  every warning policy's `workItem` resolves to an OPEN row.
//   1  a `workItem` names a CLOSED row — named with its policy and its number.
//   2  the run COULD NOT MEASURE: the reader threw (offline, unauthenticated, rate-limited, row not found),
//      the corpus came back empty, or the positive control did not report CLOSED. Never a clean zero.
//
// THE SAME-INVOCATION POSITIVE CONTROL, which is the reason #2070 exists at all. Every failure mode of a
// board reader — an unparsed payload, a defaulted field, a stubbed-out call — produces the string this judge
// most wants to see, `OPEN`, for every row, and that reads exactly like a clean bar. So each run also asks
// about `CLOSED_CONTROL_ISSUE`, whose answer must be `CLOSED`, and refuses the whole run when it is not: the
// reader has been proven able to SAY closed in the same invocation that reports no closed carriers.
// Deliberately one-directional: a reader stuck on `CLOSED` reds every carrier at once, which is loud and
// self-announcing; a reader stuck on `OPEN` is silent, and silence is what this control buys.
import { EXIT } from "../../_shared/exit-contract.ts";
import type { GatePolicy } from "../contract/policy.ts";

/** The two states the board reports for an issue. */
export type BoardIssueState = "OPEN" | "CLOSED";

/** The injected board door. THROWS on anything it cannot answer — an unreachable or unauthenticated board,
 *  a rate limit, a number that resolves to no issue. It must never return a guess: a defaulted `OPEN` is the
 *  exact false green this whole module exists to make impossible. */
export type BoardStateReader = (issue: number) => BoardIssueState;

/** One warning policy and the board row it claims owns its debt. */
export interface WorkItemCitation {
  readonly policy: string;
  readonly workItem: number;
}

export interface WorkItemLivenessOutcome {
  /** Final policies the corpus load produced — the denominator, so a zero population is visibly a real zero. */
  readonly corpus: number;
  /** Every warning-tier citation, in corpus order. */
  readonly citations: readonly WorkItemCitation[];
  /** The subset whose row the board reports CLOSED. */
  readonly closed: readonly WorkItemCitation[];
  /** The control this run actually asked about, and what came back (always `CLOSED` — a run that saw
   *  anything else threw instead of producing this outcome). */
  readonly control: { readonly issue: number; readonly state: BoardIssueState };
}

export interface WorkItemLivenessInput {
  readonly policies: readonly GatePolicy[];
  readonly readState: BoardStateReader;
  /** Overridable so the control's OWN failure arm is pinnable; production uses the default. */
  readonly controlIssue?: number;
}

/** ISSUE #1, `Migrate documentation into an evidence-backed control plane`, CLOSED as COMPLETED — the
 *  repository's first row, from the doc-migration era that predates every gate in this corpus. It is chosen
 *  for being the least reopenable row on the board rather than for its subject, and the choice is
 *  self-announcing: should anyone reopen it, this module REFUSES (exit 2) naming the constant, which is a
 *  louder outcome than any silent drift the control was placed to catch. */
export const CLOSED_CONTROL_ISSUE = 1;

/** The warning-tier citations of a loaded corpus. The severity union (`contract/policy.ts`) makes this total:
 *  `workItem` exists exactly on the `warning` arm, so there is no undefined case to invent a default for. */
export function warningWorkItems(policies: readonly GatePolicy[]): readonly WorkItemCitation[] {
  const citations: WorkItemCitation[] = [];
  for (const policy of policies) {
    if (policy.severity === "warning") {
      citations.push({ policy: policy.id, workItem: policy.workItem });
    }
  }
  return citations;
}

/** Judge one run. Throws — the exit-2 class — for every shape that is not a verdict; returns an outcome for
 *  the two that are. The control is asked FIRST so a blind reader is refused before its answers are read as
 *  data, and reader throws propagate unchanged: their message names the failing call. */
export function judgeWorkItemLiveness(input: WorkItemLivenessInput): WorkItemLivenessOutcome {
  const { policies, readState } = input;
  const controlIssue = input.controlIssue ?? CLOSED_CONTROL_ISSUE;
  if (policies.length === 0) {
    throw new Error(
      "workitem-liveness: the policy corpus came back EMPTY, so there are no warning citations to judge and a clean exit would claim there were none.",
    );
  }
  const controlState = readState(controlIssue);
  if (controlState !== "CLOSED") {
    throw new Error(
      `workitem-liveness: the positive control #${String(controlIssue)} came back ${controlState}, not CLOSED — this run cannot tell a live citation from a reader that only ever says OPEN. ` +
        "Either the control row was reopened (move CLOSED_CONTROL_ISSUE to another permanently-closed row and say why) or the board reader is broken; the run is not a verdict either way.",
    );
  }
  const citations = warningWorkItems(policies);
  const closed = citations.filter((citation) => readState(citation.workItem) === "CLOSED");
  return { corpus: policies.length, citations, closed, control: { issue: controlIssue, state: controlState } };
}

/** The report, denominators first: a reader must be able to tell "no closed citations" from "nothing was
 *  looked at", and the control line is what makes the zero worth anything. */
export function workItemLivenessReport(outcome: WorkItemLivenessOutcome): readonly string[] {
  const lines = [
    `workitem-liveness — ${String(outcome.citations.length)} warning citation(s) over ${String(outcome.corpus)} final policy(s); ` +
      `${String(outcome.closed.length)} name(s) a CLOSED row · control #${String(outcome.control.issue)} reported ${outcome.control.state} in this run`,
  ];
  for (const citation of outcome.citations) {
    const closed = outcome.closed.some((row) => row.policy === citation.policy);
    lines.push(`  ${citation.policy}: workItem #${String(citation.workItem)} — ${closed ? "CLOSED" : "OPEN"}`);
  }
  for (const citation of outcome.closed) {
    lines.push(
      `  ${citation.policy} carries \`workItem: ${String(citation.workItem)}\` and #${String(citation.workItem)} is CLOSED on the board — the debt has no live owner. ` +
        "Repoint it at the row that owns the remaining work, or take the policy to `hard`/`error` and drop `workItem` in the commit that takes its effective count to zero.",
    );
  }
  return lines;
}

/** 0 or 1 only. The exit-2 class is a THROW from the judge or the reader, never a value returned here. */
export function workItemLivenessExit(outcome: WorkItemLivenessOutcome): number {
  return outcome.closed.length > 0 ? EXIT.violations : EXIT.clean;
}
