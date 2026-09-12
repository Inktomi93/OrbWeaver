// SELECTION RESOLUTION — the ONE place a parsed `PolicySelector` meets a ROSTER (#1964).
//
// The grammar half lives in `lib/policy-command.ts` (`buildSelector`: ambiguity, nonempty, duplicate,
// kebab-case). This module owns the half that needs the corpus: which names actually EXIST, and which
// descriptors a selection therefore admits. Both doors reach it and neither re-decides it —
//   `lib/policy-plan.ts`   the planner, over a FINAL roster, wrapping a refusal as a planning misuse;
//   `ops/structure.ts`     the MIXED front door, over both contracts, wrapping it as a thrown UsageError.
//
// The mixed side works because the corpus directory gives both contracts ONE FLAT id namespace: the loader
// asserts `name === basename` for a legacy descriptor and `id === basename` for a final policy, and two
// modules in one directory cannot share a basename. So a `--check` name resolves to at most one module and
// never to both. `--family` is final-only — a legacy descriptor has no family — which is why a legacy gate
// name handed to `--family` is an unknown selection rather than a silent empty run.
import type { MixedGateCorpus, SelectedGateCorpus } from "../contract/gate-corpus.ts";
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

function availableNames(corpus: MixedGateCorpus, selector: PolicySelector): ReadonlySet<string> {
  if (selector.kind === "family") {
    return new Set(corpus.final.map((policy) => policy.family));
  }
  return new Set([...corpus.legacy.map((gate) => gate.name), ...corpus.final.map((policy) => policy.id)]);
}

/** Resolve a selection against the MIXED corpus: the refusal message, or the two contracts' views of what was
 *  asked for. `{kind:"all"}` returns the corpus unchanged, which is what keeps the default run byte-identical.
 *
 *  A selection that matched nothing can only come back as a REFUSAL, never as an empty `SelectedGateCorpus` —
 *  an empty selection that ran would report a clean zero about a gate nobody executed, which is the exact
 *  failure the gate-scoped door exists to close. */
export function resolveMixedSelection(corpus: MixedGateCorpus, selector: PolicySelector): SelectedGateCorpus | { readonly message: string } {
  const refusal = refuseSelection(selector, availableNames(corpus, selector));
  if (refusal !== null) {
    return { message: refusal };
  }
  if (selector.kind === "all") {
    return { legacy: corpus.legacy, final: corpus.final };
  }
  const requested = new Set(selector.names);
  if (selector.kind === "family") {
    return { legacy: [], final: corpus.final.filter((policy) => requested.has(policy.family)) };
  }
  return { legacy: corpus.legacy.filter((gate) => requested.has(gate.name)), final: corpus.final.filter((policy) => requested.has(policy.id)) };
}

export function isSelectionFailure(value: SelectedGateCorpus | { readonly message: string }): value is { readonly message: string } {
  return "message" in value;
}
