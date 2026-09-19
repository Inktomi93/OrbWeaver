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
//   structure-delta ops/structure-delta.ts (optional `--before`/`--after` slot ids, #2110)
//   structure    ops/structure.ts (zero or one `--fail-on-warnings`, plus a repeatable `--check`/`--family`
//                                  gate selection — every token reached from lib/policy-command.ts, #1964)
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

/** `own` — the verb's own parse module refuses what it doesn't know; the object form — the verb takes NO
 *  tail at all, and `scopedDoor` names the SCOPED sibling the operator was reaching for when they typed one.
 *
 *  A no-tail refusal that only says "no arguments" leaves the operator with nowhere to go, and for `eslint`
 *  it is a dead end that has cost lane time: the whole-repo verb genuinely takes no paths, and the scoped
 *  answer lives in a DIFFERENT tool (`pnpm exec eslint <files>`, which carries the workspace heap floor).
 *  So the door rides on the same mapped record the grammar does — one home, and a new `VerifyVerb` still
 *  fails tsc until its tail is ruled on. */
type TailGrammar = "own" | { readonly tail: "none"; readonly scopedDoor?: string };

const NO_TAIL = { tail: "none" } as const;

const VERB_TAIL: Readonly<Record<VerifyVerb, TailGrammar>> = {
  run: "own",
  structure: "own",
  "structure-delta": "own",
  show: "own",
  scoped: "own",
  "scoped-test": "own",
  "new-gate": "own",
  "gate-contract": NO_TAIL,
  "policy-conformance": NO_TAIL,
  baseline: "own",
  "tests-membership": "own",
  "tests-execution-membership": NO_TAIL,
  "db-baseline": NO_TAIL,
  "asset-refs": NO_TAIL,
  "orphan-ratchet": "own",
  "boot-chunk": NO_TAIL,
  "ledgers-fresh": NO_TAIL,
  "ledger-claims": "own",
  "board-citations": NO_TAIL,
  debt: "own",
  "ratchet-gate": NO_TAIL,
  "config-snapshot": "own",
  "biome-rule-liveness": NO_TAIL,
  "typecheck-plan": "own",
  typecheck: "own",
  eslint: { tail: "none", scopedDoor: "pnpm exec eslint <files>" },
  // The branch diff IS the selection, so a path tail would be a second, contradicting selector. An
  // operator who wants named instrument specs is reaching for the scoped test door.
  "instrument-affected": { tail: "none", scopedDoor: "pnpm test:scoped <tests/tooling paths…>" },
};

/** Refuse a tail on a verb that takes none — called by the front door AFTER the `--help` answer (a help
 *  request is not a tail) and BEFORE dispatch, so nothing has been built when the refusal prints. */
export function refuseVerbTail(verb: VerifyVerb, rest: readonly string[]): void {
  const grammar = VERB_TAIL[verb];
  if (grammar === "own" || rest.length === 0) {
    return;
  }
  const got = rest.map((token) => JSON.stringify(token)).join(" ");
  const door = grammar.scopedDoor === undefined ? "" : ` — for a SCOPED run use \`${grammar.scopedDoor}\``;
  throw new UsageError(`${verb} takes no arguments — got ${got}${door}`);
}
