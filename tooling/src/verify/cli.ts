// `verify` — the ONE argv front door for the whole verification system (docs/architecture/core/Core-Tooling-Law.md
// §2.5/§2.6). Twelve pnpm rows point HERE, each naming a verb; nothing points into ops/, so there is exactly
// one argv parse and one exit-honesty runner for the harness that judges everything else.
//
//   check / verify           → cli.ts run [--static|--push|--full|--changed|--list|…]
//   check:structure          → cli.ts structure [--fail-on-warnings] [--check|--family …] [--void <slot> --reason …]
//   check:structure-delta    → cli.ts structure-delta [--before <slot>] [--after <slot>]  (per-policy diff, #2110)
//   check:show               → cli.ts show [--errors-only|--gate|--file|--limit]
//   (scoped, from selection) → cli.ts scoped (--scope|--package|--changed)
//   test:scoped / test:ct  → cli.ts scoped-test <node|ct> [paths…] (the path preflight, #1192)
//   gate:new                 → cli.ts new-gate <kebab-name>
//   check:policy-conformance → cli.ts policy-conformance  (every final policy's own proofs, #1941)
//   prose:baseline           → cli.ts baseline prose      (+ the 7 other committed baselines)
//   check:type-ownership   → cli.ts tests-membership
//   check:tests-execution-membership → cli.ts tests-execution-membership
//   check:db-baseline        → cli.ts db-baseline
//   check:asset-refs         → cli.ts asset-refs
//   check:orphan-ratchet     → cli.ts orphan-ratchet [--update]
//   check:boot-chunk         → cli.ts boot-chunk
//   check:ledgers-fresh      → cli.ts ledgers-fresh  (the committed-ledger freshness tripwire, #817)
//   check:ledger-claims      → cli.ts ledger-claims --since <rev> [--until <rev>]  (the BARRIER check on
//                              commit-message ledger claims, #2195 — an operator-stated range, never a default)
//   debt                     → cli.ts debt [--gate substr] [--age]  (a LENS over the ratchet ledgers)
//   test:ratchets            → cli.ts ratchet-gate  (the VITEST-tier train-gate aggregate, #667)
//   config-snapshot          → cli.ts config-snapshot <runner> <config>  (native-config observation)
//   check:biome-rule-liveness → cli.ts biome-rule-liveness  (the RULE half of biome grant liveness, #2074)
//   typecheck-plan           → cli.ts typecheck-plan --primary|--affected --file <paths…>
//   typecheck                → cli.ts typecheck [--config <paths>…]
//   eslint                   → cli.ts eslint  (whole-tree native compiler-owner process isolation)
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import type { VerifyVerb } from "./index.ts";
import {
  BASELINE_HELP,
  CONFIG_SNAPSHOT_HELP,
  LEDGER_CLAIMS_HELP,
  parse,
  refuseVerbTail,
  runAssetRefsCoverage,
  runBaseline,
  runBiomeRuleLiveness,
  runBootChunkRatchet,
  runConfigSnapshot,
  runDbBaselineParity,
  runDebtWalk,
  runEslint,
  runGateContract,
  runLedgerClaims,
  runLedgersFresh,
  runNewGate,
  runOrphanRatchet,
  runPolicyConformance,
  runRatchetGateCli,
  runScopedCli,
  runScopedTest,
  runShow,
  runStructure,
  runStructureDelta,
  runTestsExecutionMembership,
  runTestsTypeMembership,
  runTypecheck,
  runTypecheckPlan,
  runVerify,
  SCOPED_TEST_USAGE,
  SCOPED_USAGE,
  SHOW_HELP,
  STRUCTURE_DELTA_USAGE,
  STRUCTURE_USAGE,
  TYPECHECK_HELP,
  TYPECHECK_PLAN_HELP,
  VERIFY_VERBS,
} from "./index.ts";

const USAGE = `usage: node tooling/src/verify/cli.ts <${VERIFY_VERBS.join("|")}> [args…]`;

/** ONE usage line per verb, answered BEFORE dispatch (#809).
 *
 *  `structure --help` used to fall through to `runStructure`, which loads the whole-repo ts-morph project
 *  before it ever looks at argv — measured on this tree: exit 134 (heap OOM) in 5.4s under bare node's
 *  ~4GB self-cap. A help request must never do work; it is answered here, where nothing has been built yet.
 *
 *  A mapped-type `Record<VerifyVerb, …>` rather than a switch or a partial map: a new `VERIFY_VERBS`
 *  member fails tsc until it has a help line, so the front door cannot grow a verb that OOMs on `--help`
 *  (and the pin in tests/tooling/verify/cli.int.test.ts reads the same tuple, so it exercises it too).
 *  The two verbs that own richer text supply it themselves (`show`, `scoped`) — one home each. */
const VERB_HELP: Readonly<Record<VerifyVerb, string>> = {
  run: "usage: node tooling/src/verify/cli.ts run [--static|--push|--full|--changed] [--scope <glob>|--package <name>|--file <paths…>] [--tier <name>] [--strict-scope] [--list] [--json] [--verbose]",
  structure: STRUCTURE_USAGE,
  "structure-delta": STRUCTURE_DELTA_USAGE,
  show: SHOW_HELP,
  scoped: SCOPED_USAGE,
  "scoped-test": SCOPED_TEST_USAGE,
  "new-gate": "usage: node tooling/src/verify/cli.ts new-gate <kebab-name>\n  Scaffolds a gate descriptor + its conformance proofs (GATE-AUTHORING.md).",
  "gate-contract": "usage: node tooling/src/verify/cli.ts gate-contract\n  Reports gate modules that bypass the shared ts-morph runtime contract.",
  "policy-conformance":
    "usage: node tooling/src/verify/cli.ts policy-conformance\n  Runs every final defineGate policy's own mustFlag/mustPass rows through the production dispatcher (#1941); a failed proof is exit 2.",
  baseline: BASELINE_HELP,
  "tests-membership":
    "usage: node tooling/src/verify/cli.ts tests-membership [--json]\n  Reports intended and actual compiler ownership for every authored TypeScript file.",
  "tests-execution-membership":
    "usage: node tooling/src/verify/cli.ts tests-execution-membership\n  Reconciles which test files a vitest project actually RUNS — reports the unrun.",
  "db-baseline": "usage: node tooling/src/verify/cli.ts db-baseline\n  Compares the drizzle schema against the committed 0000_baseline.sql.",
  "asset-refs":
    "usage: node tooling/src/verify/cli.ts asset-refs\n  Reconciles every live FK\u2192assets.id column against the asset-ref classification registry.",
  "orphan-ratchet": "usage: node tooling/src/verify/cli.ts orphan-ratchet [--update]\n  The orphan-export ratchet; --update rewrites its committed baseline.",
  "boot-chunk": "usage: node tooling/src/verify/cli.ts boot-chunk\n  Measures the client boot chunk against its committed ceiling.",
  "ledgers-fresh":
    "usage: node tooling/src/verify/cli.ts ledgers-fresh\n  Reds when a committed single-writer ledger (the caught-failure census and its siblings) differs from a fresh derivation. Writes nothing; names the differing rows and the regen command.",
  "ledger-claims": LEDGER_CLAIMS_HELP,
  debt: "usage: node tooling/src/verify/cli.ts debt [--gate <substr>] [--age]\n  A LENS over the ratchet ledgers — reports parked rows, oldest first with --age.",
  "ratchet-gate": "usage: node tooling/src/verify/cli.ts ratchet-gate\n  The vitest-tier train-gate aggregate over the ratchets (#667).",
  "config-snapshot": CONFIG_SNAPSHOT_HELP,
  "biome-rule-liveness":
    "usage: node tooling/src/verify/cli.ts biome-rule-liveness\n  Reds when a biome.json rule-off grant suppresses NOTHING — it strips the rule-off grants from a copy of the config, runs biome over the granted files, and names the grants that fired nowhere. Refuses (exit 2) on any report it cannot trust; a bare zero is never a verdict.",
  "typecheck-plan": TYPECHECK_PLAN_HELP,
  typecheck: TYPECHECK_HELP,
  eslint:
    "usage: node tooling/src/verify/cli.ts eslint\n  Runs whole-repository ESLint in sequential native compiler-owner processes. It takes NO paths: a SCOPED run is `pnpm exec eslint <files>`, which carries the same workspace heap floor.",
};

function isVerb(candidate: string): candidate is VerifyVerb {
  return (VERIFY_VERBS as readonly string[]).includes(candidate);
}

/** A `--help`/`-h` ANYWHERE in a known verb's args is a help request — no verb takes those as a value. */
function helpRequested(rest: readonly string[]): boolean {
  return rest.some((arg) => arg === "--help" || arg === "-h");
}

async function dispatch(verb: string, root: string, rest: readonly string[]): Promise<number> {
  switch (verb) {
    case "run": {
      const parsed = parse(rest);
      if ("error" in parsed) {
        throw new UsageError(parsed.error);
      }
      return await runVerify(root, parsed);
    }
    case "structure":
      return await runStructure(root, rest);
    case "structure-delta":
      return runStructureDelta(root, rest);
    case "show":
      return runShow(root, rest);
    case "scoped":
      return await runScopedCli(root, rest);
    case "scoped-test":
      return await runScopedTest(root, rest);
    case "new-gate":
      return runNewGate(root, rest);
    case "gate-contract":
      return runGateContract(root);
    case "policy-conformance":
      return await runPolicyConformance(root);
    case "baseline":
      return runBaseline(root, rest);
    case "tests-membership":
      return runTestsTypeMembership(root, rest);
    case "tests-execution-membership":
      return runTestsExecutionMembership(root);
    case "db-baseline":
      return await runDbBaselineParity(root);
    case "asset-refs":
      return await runAssetRefsCoverage(root);
    case "orphan-ratchet":
      return runOrphanRatchet(root, rest);
    case "boot-chunk":
      return await runBootChunkRatchet(root);
    case "ledgers-fresh":
      return runLedgersFresh(root);
    case "ledger-claims":
      return runLedgerClaims(root, rest);
    case "biome-rule-liveness":
      return runBiomeRuleLiveness(root);
    case "debt":
      return runDebtWalk(root, rest);
    case "ratchet-gate":
      return runRatchetGateCli(root);
    case "config-snapshot": {
      return await runConfigSnapshot(root, rest);
    }
    case "typecheck-plan":
      return runTypecheckPlan(root, rest);
    case "typecheck":
      return await runTypecheck(root, rest);
    case "eslint":
      return await runEslint(root);
    default:
      throw new UsageError(`unknown verb "${verb}"\n${USAGE}`);
  }
}

await runTool(async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === undefined || verb === "--help" || verb === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return verb === undefined ? EXIT.misuse : EXIT.clean;
  }
  // ANSWER HELP BEFORE ANY WORK (#809) — see VERB_HELP. `structure --help` reached the subcommand body,
  // which builds the whole-repo ts-morph project, and died at 134 before argv was ever consulted.
  if (isVerb(verb) && helpRequested(rest)) {
    process.stdout.write(`${VERB_HELP[verb]}\n`);
    return EXIT.clean;
  }
  // The TAIL axis (#1117): the verbs that take no arguments used to consume `rest` unread, so a typo'd
  // scope flag ran the whole-tree verb and reported a verdict about a scope nobody asked for. Refused
  // here, after the help answer and before any work — lib/verb-tail.ts rules every verb.
  if (isVerb(verb)) {
    refuseVerbTail(verb, rest);
  }
  return await dispatch(verb, process.cwd(), rest);
});
