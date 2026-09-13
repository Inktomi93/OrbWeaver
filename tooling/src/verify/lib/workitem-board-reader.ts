// THE NETWORK DOOR for warning-debt `workItem` liveness (#2070) — one function, kept apart from the judge
// (`lib/workitem-liveness.ts`) so every outcome the judge can reach, refusal included, is pinnable with no
// board and no `gh` on PATH.
//
// IT REUSES THE WORKBOARD'S OWN READER and spells no second `gh` invocation. `fetchIssueContext` is the
// tool's targeted issue walk: it enters through the front door (`#workboard`, Core-Tooling-Law §4.2), it
// carries the ONE `gh` failure translator (`workboard/ops/gh.ts` turns both rate-limit shapes into operator
// instructions before they escape), and it THROWS `#N was not found in <repo>` on a number that resolves to
// nothing. Every one of those throws is the exit-2 class at the caller — which is the contract: a board this
// run could not reach is not a board with no closed rows.
//
// COST: one targeted GraphQL walk per issue, which is right for this population (three warning citations
// plus the control today). #2156's superset verb reconciles hundreds of citations across three classes and
// should read the board ONCE through `work:item list` instead; that is a different denominator, not a
// different answer, and the judge takes the reader as a parameter precisely so either can supply it.
import { fetchIssueContext } from "#workboard";
import type { BoardIssueState } from "./workitem-liveness.ts";

/** The production `BoardStateReader`. Throws rather than guessing — see the module header. */
export function boardIssueState(issue: number): BoardIssueState {
  return fetchIssueContext(issue).target.state;
}
