/** The live half: either the per-gate admissions, or the ONE SENTENCE saying why there are none (#2222).
 *
 * It used to be `… | null`, and the four causes — no artifact, unparseable, the run DIED, the run is a
 * NON-VERDICT — collapsed into one bare `null` the printer rendered as a generic disjunction ("missing,
 * malformed, or from a run that did not finish") that did not even LIST the non-verdict case. A refusal
 * nobody can act on is the same disease as a zero nobody can trust: the operator could not tell "run
 * check:structure" from "your last run was the gate self-test's own child". Each arm now carries its own
 * reason, and the non-verdict arm quotes the run's own words verbatim. */
export type LiveAdmission =
  | { readonly ok: true; readonly runId: string; readonly byOwner: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly why: string };
