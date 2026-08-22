// `verify` — the ONE argv front door for the whole verification system (docs/design/tooling-package.md
// §2.5/§2.6). Ten pnpm rows point HERE, each naming a verb; nothing points into ops/, so there is exactly
// one argv parse and one exit-honesty runner for the harness that judges everything else.
//
//   check / verify           → cli.ts run [--static|--push|--full|--changed|--list|…]
//   check:structure          → cli.ts structure
//   check:show               → cli.ts show [--errors-only|--gate|--file|--limit]
//   (scoped, from selection) → cli.ts scoped (--scope|--package|--changed)
//   gate:new                 → cli.ts new-gate <kebab-name>
//   prose:baseline           → cli.ts baseline prose      (+ the 8 other committed baselines)
//   check:tests-membership   → cli.ts tests-membership
//   check:tests-execution-membership → cli.ts tests-execution-membership
//   check:db-baseline        → cli.ts db-baseline
//   check:orphan-ratchet     → cli.ts orphan-ratchet [--update]
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import {
  generateBaseuiSurface,
  generateDensityBaseline,
  generateDuplicateActionDoorsBaseline,
  generateFabricationBaseline,
  generateFindingOverloadProvenanceBaseline,
  generateModelProseBaseline,
  generateProseBaseline,
  generateSuppressionsBaseline,
  generateTestBaselineManifest,
  parse,
  runDbBaselineParity,
  runNewGate,
  runOrphanRatchet,
  runScopedCli,
  runShow,
  runStructure,
  runTestsExecutionMembership,
  runTestsTypeMembership,
  runVerify,
} from "./index.ts";

/** The committed baselines this tool is the SINGLE writer of (GATE-AUTHORING §4.8). A `Record` rather than
 *  a switch: a new baseline generator is a row, and tsc requires the row to exist before the kind can be
 *  spelled anywhere. */
const BASELINES: Readonly<Record<string, (root: string) => number>> = {
  "baseui-surface": generateBaseuiSurface,
  density: generateDensityBaseline,
  "duplicate-action-doors": generateDuplicateActionDoorsBaseline,
  fabrication: generateFabricationBaseline,
  "finding-overload-provenance": generateFindingOverloadProvenanceBaseline,
  "model-prose": generateModelProseBaseline,
  prose: generateProseBaseline,
  suppressions: generateSuppressionsBaseline,
  "test-baseline-manifest": generateTestBaselineManifest,
};

const VERBS = [
  "run",
  "structure",
  "show",
  "scoped",
  "new-gate",
  "baseline",
  "tests-membership",
  "tests-execution-membership",
  "db-baseline",
  "orphan-ratchet",
] as const;

const USAGE = `usage: node tooling/src/verify/cli.ts <${VERBS.join("|")}> [args…]`;

function runBaseline(root: string, rest: readonly string[]): number {
  const kind = rest[0];
  const generate = kind === undefined ? undefined : BASELINES[kind];
  if (generate === undefined) {
    throw new UsageError(`baseline: unknown kind ${kind ?? "(none)"} — one of ${Object.keys(BASELINES).sort().join(", ")}`);
  }
  return generate(root);
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
  return await dispatch(verb, process.cwd(), rest);
});
