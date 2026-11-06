// migrate-owner: plan one census owner, then run the class-token-to-prop workflow over it. A dry run by default; `--apply` rewrites,
// formats, proves the owner against a census rerun and typechecks. The steps are the workflow's; this only orders the plan before them.
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { runNicedSync } from "../floor/process/proc.ts";

const WORKFLOW_DIR = "tooling/src/codemods/class-token-to-prop";
const MAP_DIR = "reports/migration";
const CENSUS_DIR = "reports/ui-facts-census";
const USAGE = "usage: pnpm migrate-owner <component.axis> [--apply]";

interface Args {
  readonly owner: string;
  readonly apply: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const operands = argv.filter((arg) => !arg.startsWith("--"));
  const [owner] = operands;
  if (owner === undefined || operands.length !== 1 || flags.some((flag) => flag !== "--apply")) {
    throw new UsageError(USAGE);
  }
  return { owner, apply: flags.length > 0 };
}

function run(command: string, args: readonly string[]): number {
  process.stdout.write(`migrate-owner: ${command} ${args.join(" ")}\n`);
  const result = runNicedSync(command, args, { stdio: "inherit" });
  return result.status ?? EXIT.toolError;
}

export function runMigrateOwner(argv: readonly string[]): number {
  const { owner, apply } = parseArgs(argv);
  const map = `${MAP_DIR}/${owner}.json`;
  // `codemod --dry-run` skips every `run:` step, so the plan is written here, before the workflow reads it.
  const planned = run("pnpm", ["ui-facts", "--only=hand-rolling", `--out=${CENSUS_DIR}`, `--plan=${owner}`, `--map=${map}`]);
  if (planned !== EXIT.clean) {
    return planned;
  }
  return run("pnpm", [
    "codemod",
    "workflow",
    "run",
    "-w",
    WORKFLOW_DIR,
    "-t",
    ".",
    "--no-interactive",
    "--allow-dirty",
    "--param",
    `owner=${owner}`,
    "--param",
    `map=${map}`,
    ...(apply ? ["--param", "apply=yes"] : ["--dry-run"]),
  ]);
}
