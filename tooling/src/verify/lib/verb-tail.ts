// The per-verb TAIL grammar of the `verify` front door (#1117). `cli.ts` owns the VERB axis — an unknown
// verb has always been misuse — but the tail each verb receives was, for half the roster, whatever the
// operator typed: a verb that takes no arguments consumed `rest` without ever looking at it, so
// `cli.ts ledgers-fresh --scope packages/ui` re-derived every committed ledger over the WHOLE tree and
// exited 0, reporting a verdict about a scope nobody asked for (measured on this tree, red-first).
//
// A mapped `Record<VerifyVerb, TailGrammar>` rather than a list of names: a new VERIFY_VERBS member fails
// tsc until its tail is RULED on, which is the same shape (and the same reason) as cli.ts's VERB_HELP.
//
// "own" is not a hole — it names the verb whose tail is parsed STRICTLY somewhere else, one home each:
//   run          lib/run-argv.ts  (node:util parseArgs, strict:true)
//   structure    ops/structure.ts (zero or one `--fail-on-warnings`, and nothing else)
//   show         ops/show.ts      (its parse switch defaults to UsageError)
//   debt         ops/debt.ts      (same shape)
//   scoped       ops/scoped.ts    (selector validation + the unknown-token sweep)
//   scoped-test  ops/scoped-test.ts (the runner name, then the caller's path claims + runner flags)
//   baseline     cli.ts runBaseline (the kind table + `--check`)
//   new-gate     ops/new-gate.ts  (exactly one kebab name)
//   orphan-ratchet ops/orphan-export-ratchet.ts (`--update`, and nothing else)
//   tests-membership ops/tests-type-membership.ts (`--json`, and nothing else)
//   config-snapshot ops/config-snapshot.ts (runner kind + config path)
//   typecheck-plan ops/typecheck-plan.ts (mode + file paths + optional JSON)
//   typecheck     ops/typecheck.ts (zero or more repeated --config selectors)
import { UsageError } from "../../_shared/run-tool.ts";
import type { VerifyVerb } from "../contract/verbs.ts";

/** `none` — the verb takes NO tail at all; `own` — the verb's own parse module refuses what it doesn't know. */
type TailGrammar = "none" | "own";

const VERB_TAIL: Readonly<Record<VerifyVerb, TailGrammar>> = {
  run: "own",
  structure: "own",
  show: "own",
  scoped: "own",
  "scoped-test": "own",
  "new-gate": "own",
  "gate-contract": "none",
  "policy-conformance": "none",
  baseline: "own",
  "tests-membership": "own",
  "tests-execution-membership": "none",
  "db-baseline": "none",
  "asset-refs": "none",
  "orphan-ratchet": "own",
  "boot-chunk": "none",
  "ledgers-fresh": "none",
  debt: "own",
  "ratchet-gate": "none",
  "config-snapshot": "own",
  "typecheck-plan": "own",
  typecheck: "own",
  eslint: "none",
};

/** Refuse a tail on a verb that takes none — called by the front door AFTER the `--help` answer (a help
 *  request is not a tail) and BEFORE dispatch, so nothing has been built when the refusal prints. */
export function refuseVerbTail(verb: VerifyVerb, rest: readonly string[]): void {
  if (VERB_TAIL[verb] !== "none" || rest.length === 0) {
    return;
  }
  throw new UsageError(`${verb} takes no arguments — got ${rest.map((token) => JSON.stringify(token)).join(" ")}`);
}
