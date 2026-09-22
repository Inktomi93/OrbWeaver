// SELECTION RESOLUTION — the ONE place a parsed `PolicySelector` meets a ROSTER (#1964).
//
// The grammar half lives in `lib/policy-command.ts` (`buildSelector`: ambiguity, nonempty, duplicate,
// kebab-case). This module owns the half that needs the corpus: which names actually EXIST, and which
// policies a selection therefore admits. Both doors reach it and neither re-decides it —
//   `lib/policy-plan.ts`   the planner, wrapping a refusal as a planning misuse;
//   `ops/structure.ts`     the structure front door, wrapping it as a thrown UsageError.
//
// A `--check` name resolves to at most ONE module because the loader asserts `id === basename` and two
// modules in one directory cannot share a basename. `--family` resolves against the family names the same
// roster derives, so a policy id handed to `--family` is an unknown selection rather than a silent empty run.
import type { PolicySelector } from "../contract/policy-plan.ts";

/** Empty, duplicated and unknown names are misuse, in that order. `available` is the set of names the
 *  selector's own kind can legitimately match. Returns the refusal MESSAGE, never a verdict: each caller owns
 *  how a misuse SURFACES, and neither owns which selections are legal. */
export function refuseSelection(selector: PolicySelector, available: ReadonlySet<string>): string | null {
  if (selector.kind === "all") {
    return null;
  }
  if (selector.names.length === 0) {
    return `${selector.kind} selection must not be empty`;
  }
  const duplicate = selector.names.toSorted().find((name, index, names) => name === names[index - 1]);
  if (duplicate !== undefined) {
    return `duplicate ${selector.kind} selection ${JSON.stringify(duplicate)}`;
  }
  const unknown = selector.names.filter((name) => !available.has(name)).toSorted();
  return unknown.length > 0 ? `unknown ${selector.kind} selection(s): ${unknown.join(", ")}` : null;
}
