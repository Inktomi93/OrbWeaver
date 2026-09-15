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
import type { GateCorpus, SelectedGateCorpus } from "../contract/gate-corpus.ts";
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

function availableNames(corpus: GateCorpus, selector: PolicySelector): ReadonlySet<string> {
  if (selector.kind === "family") {
    return new Set(corpus.gates.map((policy) => policy.family));
  }
  return new Set(corpus.gates.map((policy) => policy.id));
}

/** Resolve a selection against the corpus: the refusal message, or the slice that was asked for.
 *  `{kind:"all"}` returns the corpus unchanged, which is what keeps the default run byte-identical.
 *
 *  A selection that matched nothing can only come back as a REFUSAL, never as an empty `SelectedGateCorpus` —
 *  an empty selection that ran would report a clean zero about a gate nobody executed, which is the exact
 *  failure the gate-scoped door exists to close. */
export function resolveGateSelection(corpus: GateCorpus, selector: PolicySelector): SelectedGateCorpus | { readonly message: string } {
  const refusal = refuseSelection(selector, availableNames(corpus, selector));
  if (refusal !== null) {
    return { message: refusal };
  }
  if (selector.kind === "all") {
    return { gates: corpus.gates };
  }
  const requested = new Set(selector.names);
  const key =
    selector.kind === "family"
      ? (policy: { readonly family: string; readonly id: string }): string => policy.family
      : (policy: { readonly family: string; readonly id: string }): string => policy.id;
  return { gates: corpus.gates.filter((policy) => requested.has(key(policy))) };
}

export function isSelectionFailure(value: SelectedGateCorpus | { readonly message: string }): value is { readonly message: string } {
  return "message" in value;
}
