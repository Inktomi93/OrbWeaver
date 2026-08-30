// `verify` — the ONE argv front door for the whole verification system (docs/architecture/core/Core-Tooling-Law.md
// §2.5/§2.6). Twelve pnpm rows point HERE, each naming a verb; nothing points into ops/, so there is exactly
// one argv parse and one exit-honesty runner for the harness that judges everything else.
//
//   check / verify           → cli.ts run [--static|--push|--full|--changed|--list|…]
//   check:structure          → cli.ts structure
//   check:show               → cli.ts show [--errors-only|--gate|--file|--limit]
//   (scoped, from selection) → cli.ts scoped (--scope|--package|--changed)
//   gate:new                 → cli.ts new-gate <kebab-name>
//   prose:baseline           → cli.ts baseline prose      (+ the 7 other committed baselines)
//   check:tests-membership   → cli.ts tests-membership
//   check:tests-execution-membership → cli.ts tests-execution-membership
//   check:db-baseline        → cli.ts db-baseline
//   check:orphan-ratchet     → cli.ts orphan-ratchet [--update]
//   check:boot-chunk         → cli.ts boot-chunk
//   check:ledgers-fresh      → cli.ts ledgers-fresh  (the committed-ledger freshness tripwire, #817)
//   debt                     → cli.ts debt [--gate substr] [--age]  (a LENS over the ratchet ledgers)
//   test:ratchets            → cli.ts ratchet-gate  (the VITEST-tier train-gate aggregate, #667)
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import type { VerifyVerb } from "./index.ts";
import {
  generateBaseuiSurface,
  generateCaughtFailurePopulation,
  generateDensityBaseline,
  generateDuplicateActionDoorsBaseline,
  generateOverArtPlateBaseline,
  generateProseBaseline,
  generateSuppressionsBaseline,
  generateTestBaselineManifest,
  generateTestPresenceBaseline,
  LEDGER_CHECKS,
  parse,
  runBootChunkRatchet,
  runDbBaselineParity,
  runDebtWalk,
  runLedgersFresh,
  runNewGate,
  runOrphanRatchet,
  runRatchetGateCli,
  runScopedCli,
  runShow,
  runStructure,
  runTestsExecutionMembership,
  runTestsTypeMembership,
  runVerify,
  SCOPED_USAGE,
  SHOW_HELP,
  VERIFY_VERBS,
} from "./index.ts";

/** The committed baselines this tool is the SINGLE writer of (GATE-AUTHORING §4.8). A `Record` rather than
 *  a switch: a new baseline generator is a row, and tsc requires the row to exist before the kind can be
 *  spelled anywhere. */
const BASELINES: Readonly<Record<string, (root: string) => number>> = {
  "baseui-surface": generateBaseuiSurface,
  // NOT a ratchet: a derived REVIEW RECORD no gate reads (#751). It rides the same single-writer door so
  // the census cannot be hand-edited into agreement with itself.
  "caught-failure-population": generateCaughtFailurePopulation,
  density: generateDensityBaseline,
  "duplicate-action-doors": generateDuplicateActionDoorsBaseline,
  "over-art-plate-arm": generateOverArtPlateBaseline,
  prose: generateProseBaseline,
  suppressions: generateSuppressionsBaseline,
  "test-baseline-manifest": generateTestBaselineManifest,
  "test-presence": generateTestPresenceBaseline,
};

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
  structure:
    "usage: node tooling/src/verify/cli.ts structure\n  Runs every structural gate in one ts-morph pass; writes reports/check-structure.json (read it with `show`).",
  show: SHOW_HELP,
  scoped: SCOPED_USAGE,
  "new-gate": "usage: node tooling/src/verify/cli.ts new-gate <kebab-name>\n  Scaffolds a gate descriptor + its conformance proofs (GATE-AUTHORING.md).",
  baseline: `usage: node tooling/src/verify/cli.ts baseline <${Object.keys(BASELINES).sort().join("|")}> [--check]\n  Regenerates a COMMITTED baseline — the single-writer door (GATE-AUTHORING §4.8). Never run on a shared tree mid-lane.\n  --check derives and DIFFS instead of writing (exit 1 on drift); available for ${Object.keys(LEDGER_CHECKS).sort().join(", ")}.`,
  "tests-membership":
    "usage: node tooling/src/verify/cli.ts tests-membership\n  Reconciles which test files each TYPE program compiles — reports the escapees.",
  "tests-execution-membership":
    "usage: node tooling/src/verify/cli.ts tests-execution-membership\n  Reconciles which test files a vitest project actually RUNS — reports the unrun.",
  "db-baseline": "usage: node tooling/src/verify/cli.ts db-baseline\n  Compares the drizzle schema against the committed 0000_baseline.sql.",
  "orphan-ratchet": "usage: node tooling/src/verify/cli.ts orphan-ratchet [--update]\n  The orphan-export ratchet; --update rewrites its committed baseline.",
  "boot-chunk": "usage: node tooling/src/verify/cli.ts boot-chunk\n  Measures the client boot chunk against its committed ceiling.",
  "ledgers-fresh":
    "usage: node tooling/src/verify/cli.ts ledgers-fresh\n  Reds when a committed single-writer ledger (the caught-failure census, the test-baseline manifest) differs from a fresh derivation. Writes nothing; names the differing rows and the regen command.",
  debt: "usage: node tooling/src/verify/cli.ts debt [--gate <substr>] [--age]\n  A LENS over the ratchet ledgers — reports parked rows, oldest first with --age.",
  "ratchet-gate": "usage: node tooling/src/verify/cli.ts ratchet-gate\n  The vitest-tier train-gate aggregate over the ratchets (#667).",
};

function isVerb(candidate: string): candidate is VerifyVerb {
  return (VERIFY_VERBS as readonly string[]).includes(candidate);
}

/** A `--help`/`-h` ANYWHERE in a known verb's args is a help request — no verb takes those as a value. */
function helpRequested(rest: readonly string[]): boolean {
  return rest.some((arg) => arg === "--help" || arg === "-h");
}

/** `baseline <kind>` WRITES; `baseline <kind> --check` derives and DIFFS, writing nothing (#817). Only the
 *  two line-number/fileset-coupled ledgers carry a `--check` arm — the rest have no reader that could go
 *  stale between regens, and a `--check` for a kind that has none is misuse, never a silent write. */
function runBaseline(root: string, rest: readonly string[]): number {
  const kind = rest[0];
  const generate = kind === undefined ? undefined : BASELINES[kind];
  if (kind === undefined || generate === undefined) {
    throw new UsageError(`baseline: unknown kind ${kind ?? "(none)"} — one of ${Object.keys(BASELINES).sort().join(", ")}`);
  }
  if (!rest.includes("--check")) {
    return generate(root);
  }
  const verify = LEDGER_CHECKS[kind];
  if (verify === undefined) {
    throw new UsageError(
      `baseline --check: ${kind} has no freshness arm — one of ${Object.keys(LEDGER_CHECKS).sort().join(", ")} (or drop --check to regenerate)`,
    );
  }
  return verify(root);
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
      return await runStructure(root);
    case "show":
      return runShow(root, rest);
    case "scoped":
      return await runScopedCli(root, rest);
    case "new-gate":
      return runNewGate(root, rest);
    case "baseline":
      return runBaseline(root, rest);
    case "tests-membership":
      return runTestsTypeMembership(root);
    case "tests-execution-membership":
      return runTestsExecutionMembership(root);
    case "db-baseline":
      return await runDbBaselineParity(root);
    case "orphan-ratchet":
      return runOrphanRatchet(root, rest);
    case "boot-chunk":
      return await runBootChunkRatchet(root);
    case "ledgers-fresh":
      return runLedgersFresh(root);
    case "debt":
      return runDebtWalk(root, rest);
    case "ratchet-gate":
      return runRatchetGateCli(root);
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
  return await dispatch(verb, process.cwd(), rest);
});
