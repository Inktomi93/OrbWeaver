// THE NETWORK DOOR for board-citation reconciliation (#2070/#2156) — one function, kept apart from the
// judges (`lib/board-citations.ts`, `lib/workitem-liveness.ts`) so every outcome they can reach, refusal
// included, is pinnable with no board and no `gh` on PATH.
//
// IT REUSES THE WORKBOARD'S OWN READER and spells no second `gh` invocation. `fetchIssueStates` enters
// through the front door (`#workboard`, Core-Tooling-Law §4.2) and carries the ONE `gh` failure translator
// (`workboard/ops/gh.ts` turns both rate-limit shapes into operator instructions before they escape).
// Every one of its throws is the exit-2 class at the caller — which is the contract: a board this run
// could not reach is not a board with no crossed citations.
//
// WHY BULK AND NOT PER-ISSUE. The census asks about hundreds of numbers — the refutation ledger alone
// cites 326 — so a targeted walk per citation would spend hundreds of calls to learn one enum each. The
// workboard's paged `repository.issues { number state }` walk answers the whole repository in ~24 pages,
// and it REFUSES an empty first page rather than handing back a map that answers "unknown" to everything.
import { fetchIssueStates } from "#workboard";
import type { BoardStates } from "./board-citations.ts";

/** The production board snapshot. Throws rather than guessing — see the module header. */
export function boardStates(): BoardStates {
  return fetchIssueStates();
}
