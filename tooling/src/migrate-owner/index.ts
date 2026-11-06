// migrate-owner: plan one census owner, then run the class-token-to-prop workflow over it. A dry run by default; `--apply` also rewrites,
// formats, proves the owner against a census rerun and typechecks. The steps are the workflow's; this orders them and owns the transaction:
// the dry run fails before any write, and a failed apply puts back every planned file. The workflow has no step that runs after a failure.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { runNicedSync } from "../floor/process/proc.ts";
import { sidecarsOf } from "../ui-facts/index.ts";

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

/**
 * Run a step that may rewrite the files, and put their bytes back unless it exits clean.
 *
 * @returns The step's exit code.
 */
export function withRestore(files: readonly string[], step: () => number): number {
  const before = new Map(files.map((file) => [file, readFileSync(file)]));
  let code: number = EXIT.toolError;
  try {
    code = step();
    return code;
  } finally {
    if (code !== EXIT.clean) {
      for (const [file, bytes] of before) {
        writeFileSync(file, bytes);
      }
      process.stdout.write(`migrate-owner: apply failed with exit ${code}; restored ${before.size} planned files\n`);
    }
  }
}

function plannedFiles(map: string): readonly string[] {
  const list = sidecarsOf(map).files;
  return existsSync(list)
    ? readFileSync(list, "utf8")
        .split("\n")
        .filter((file) => file !== "")
    : [];
}

export function runMigrateOwner(argv: readonly string[]): number {
  const { owner, apply } = parseArgs(argv);
  const map = `${MAP_DIR}/${owner}.json`;
  // `codemod --dry-run` skips every `run:` step, so the plan is written here, before the workflow reads it.
  const planned = run("pnpm", ["ui-facts", "--only=hand-rolling", `--out=${CENSUS_DIR}`, `--plan=${owner}`, `--map=${map}`]);
  if (planned !== EXIT.clean) {
    return planned;
  }
  const workflow = (mode: readonly string[]): number =>
    run("pnpm", [
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
      ...mode,
    ]);
  const previewed = workflow(["--dry-run"]);
  return apply && previewed === EXIT.clean ? withRestore(plannedFiles(map), () => workflow(["--param", "apply=yes"])) : previewed;
}
