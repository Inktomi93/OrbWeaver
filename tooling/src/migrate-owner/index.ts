// migrate-owner: plan one census owner, then run the class-token-to-prop workflow over it. A dry run by default; `--apply` also rewrites,
// formats, proves the owner against a census rerun and typechecks. The steps are the workflow's; this orders them and owns the transaction:
// the dry run fails before any write, the real recipes judge what was written, and a failed or interrupted apply puts back every planned file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { runNicedSync, spawnFullPriorityChild } from "../floor/process/proc.ts";
import type { FullPriorityChild } from "../floor/process/proc-contract.ts";
import { checkRewrite, sidecarsOf } from "../ui-facts/index.ts";

const WORKFLOW_DIR = "tooling/src/codemods/class-token-to-prop";
const MAP_DIR = "reports/migration";
const CENSUS_DIR = "reports/ui-facts-census";
const USAGE = "usage: pnpm migrate-owner <component.axis> [--apply]";
const SIGNAL_EXIT_BASE = 128;
const RESTORE_SIGNALS = ["SIGINT", "SIGTERM"] as const;
// `workflow.yaml` refuses `apply=yes` without this value: only this transaction restores a failed apply.
const TRANSACTION = "migrate-owner";

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

let running: FullPriorityChild | undefined;

/**
 * Run a command in its own process group, so a signal reaches every writer under it and this process outlives them to restore.
 *
 * @returns The command's exit code.
 */
export async function runGroup(command: string, args: readonly string[]): Promise<number> {
  process.stdout.write(`migrate-owner: ${command} ${args.join(" ")}\n`);
  running = spawnFullPriorityChild(command, args, { stdio: "inherit", detached: true });
  const { code } = await running.wait();
  running = undefined;
  return code ?? EXIT.toolError;
}

/**
 * Run a step that may rewrite the files, and put their bytes back unless it exits clean. SIGINT and SIGTERM go to the running group,
 * and the restore waits for it to exit: a restore cannot beat a live writer.
 *
 * @returns The step's exit code, or the shell's code for the signal that stopped it.
 */
export async function withRestore(files: readonly string[], step: () => Promise<number>): Promise<number> {
  const before = new Map(files.map((file) => [file, readFileSync(file)]));
  const signals: NodeJS.Signals[] = [];
  const forward = (signal: NodeJS.Signals): void => {
    signals.push(signal);
    running?.killGroup(signal);
  };
  let code: number = EXIT.toolError;
  for (const signal of RESTORE_SIGNALS) {
    process.on(signal, forward);
  }
  try {
    code = await step();
    const [signal] = signals;
    code = signal === undefined ? code : SIGNAL_EXIT_BASE + constants.signals[signal];
    return code;
  } finally {
    for (const signal of RESTORE_SIGNALS) {
      process.off(signal, forward);
    }
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

export function runMigrateOwner(argv: readonly string[]): Promise<number> | number {
  const { owner, apply } = parseArgs(argv);
  const map = `${MAP_DIR}/${owner}.json`;
  // `codemod --dry-run` skips every `run:` step, so the plan is written here, before the workflow reads it.
  const planned = run("pnpm", ["ui-facts", "--only=hand-rolling", `--out=${CENSUS_DIR}`, `--plan=${owner}`, `--map=${map}`]);
  if (planned !== EXIT.clean) {
    return planned;
  }
  const workflow = (mode: readonly string[]): readonly string[] => [
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
  ];
  const previewed = run("pnpm", workflow(["--dry-run"]));
  if (!apply || previewed !== EXIT.clean) {
    return previewed;
  }
  const files = plannedFiles(map);
  const snapshot = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  return withRestore(files, async () => {
    const applied = await runGroup("pnpm", workflow(["--param", "apply=yes", "--param", `transaction=${TRANSACTION}`]));
    const failures = applied === EXIT.clean ? await checkRewrite(".", map, snapshot) : [];
    for (const failure of failures) {
      process.stdout.write(`migrate-owner: ${failure}\n`);
    }
    return failures.length === 0 ? applied : EXIT.violations;
  });
}
