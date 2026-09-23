// One native typecheck door: discover authored programs, expand references, run every leaf exactly once.
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { SpawnNicedResult } from "@orb/tooling/_shared/proc";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { CompilerProgram } from "../contract/policy-scope.ts";
import type { TypecheckExecutionResult, TypecheckProgramResult, TypecheckProgramStatus } from "../contract/typecheck.ts";
import { readCompilerPrograms } from "../lib/policy-program-membership.ts";

refuseDirectInvocation(import.meta.url, "pnpm typecheck [--config <repo-relative-tsconfig>]...");

const TS7_WRAPPER = fileURLToPath(new URL("../../../../scripts/ts7.ts", import.meta.url));
const COMPILER_DIAGNOSTIC_RE = /\berror TS\d+:/u;
const NATIVE_DIAGNOSTIC_EXIT = 1;
const RESULT_LABELS = {
  passed: "PASS",
  violations: "FAIL",
  "tool-error": "TOOL ERROR",
} as const satisfies Readonly<Record<TypecheckProgramStatus, string>>;

export const TYPECHECK_HELP = "usage: pnpm typecheck [--config <repo-relative tsconfig path>]...";

export function typecheckCompilerArgv(config: string): readonly string[] {
  return [TS7_WRAPPER, "--noEmit", "--pretty", "false", "-p", config];
}

function compare(left: string, right: string): number {
  return left.localeCompare(right);
}

function parseRequestedConfigs(args: readonly string[]): readonly string[] | null {
  let values: { readonly config?: string[] };
  try {
    values = parseArgs({
      args: [...args],
      allowPositionals: false,
      strict: true,
      options: { config: { type: "string", multiple: true } },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  const configs = values.config?.map((config) => config.replace(/^\.\//u, "")) ?? [];
  return configs.length === 0 ? null : [...new Set(configs)];
}

function selectedProgramIds(programs: readonly CompilerProgram[], requested: readonly string[] | null): readonly string[] {
  if (requested === null) {
    return programs.map(({ id }) => id);
  }
  const byId = new Map(programs.map((program) => [program.id, program]));
  for (const config of requested) {
    if (!byId.has(config)) {
      throw new UsageError(`typecheck: unknown compiler program ${JSON.stringify(config)}`);
    }
  }
  const pending = [...requested];
  const selected = new Set<string>();
  while (pending.length > 0) {
    const id = pending.shift();
    if (id === undefined || selected.has(id)) {
      continue;
    }
    const program = byId.get(id);
    if (program === undefined) {
      throw new Error(`typecheck: referenced compiler program disappeared from discovery: ${id}`);
    }
    selected.add(id);
    pending.push(...program.references);
  }
  return [...selected];
}

export function classifyTypecheckChild(result: SpawnNicedResult): TypecheckProgramStatus {
  if (result.timedOut || result.code === null) {
    return "tool-error";
  }
  if (result.code === 0) {
    return "passed";
  }
  return result.code === NATIVE_DIAGNOSTIC_EXIT && COMPILER_DIAGNOSTIC_RE.test(`${result.stdout}\n${result.stderr}`) ? "violations" : "tool-error";
}

type ProgramRunner = (config: string) => Promise<SpawnNicedResult>;

async function runPrograms(programs: readonly CompilerProgram[], concurrency: number, runner: ProgramRunner): Promise<readonly TypecheckProgramResult[]> {
  let cursor = 0;
  const results: TypecheckProgramResult[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const program = programs[cursor];
      cursor += 1;
      if (program === undefined) {
        return;
      }
      // @orb-waive caught-failure-ownership(error): stored as a tool-error result; runTypecheck prints its diagnostic and returns exit 2. Ends if failed child results stop affecting the command verdict.
      try {
        const child = await runner(program.config);
        results.push({ config: program.config, status: classifyTypecheckChild(child), ...child });
      } catch (error) {
        results.push({
          config: program.config,
          status: "tool-error",
          code: null,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, programs.length) }, worker));
  return results.toSorted((left, right) => compare(left.config, right.config));
}

export async function executeTypecheckPrograms(
  root: string,
  requested: readonly string[] | null,
  options: { readonly runner?: ProgramRunner; readonly concurrency?: number } = {},
): Promise<TypecheckExecutionResult> {
  const discovered = readCompilerPrograms(root);
  const selectedIds = selectedProgramIds(discovered, requested);
  const selected = discovered.filter(({ id }) => selectedIds.includes(id));
  const skippedContainers = selected
    .filter(({ files }) => files.length === 0)
    .map(({ config }) => config)
    .toSorted(compare);
  const runnable = selected.filter(({ files }) => files.length > 0).toSorted((left, right) => compare(left.config, right.config));
  if (runnable.length === 0) {
    throw new Error("typecheck discovered zero runnable compiler programs");
  }
  const concurrency = options.concurrency ?? readConcurrencyProfile().pnpmWorkspaceConcurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`typecheck concurrency must be a positive integer, received ${String(concurrency)}`);
  }
  if (!existsSync(TS7_WRAPPER) && options.runner === undefined) {
    throw new Error(`typecheck TS7 wrapper is missing: ${TS7_WRAPPER}`);
  }
  const runner =
    options.runner ?? (async (config: string): Promise<SpawnNicedResult> => await spawnNiced(process.execPath, typecheckCompilerArgv(config), { cwd: root }));
  return {
    discovered: discovered.length,
    requested,
    skippedContainers,
    programs: await runPrograms(runnable, concurrency, runner),
    concurrency,
  };
}

function printProgram(result: TypecheckProgramResult): void {
  process.stdout.write(`${RESULT_LABELS[result.status]} ${result.config}\n`);
  if (result.stdout !== "") {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr !== "") {
    process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
}

export async function runTypecheck(root: string, args: readonly string[]): Promise<number> {
  const requested = parseRequestedConfigs(args);
  const result = await executeTypecheckPrograms(root, requested);
  process.stdout.write(
    `typecheck — ${String(result.discovered)} discovered, ${String(result.programs.length)} runnable, concurrency ${String(result.concurrency)}\n`,
  );
  for (const config of result.skippedContainers) {
    process.stdout.write(`SKIP ${config} (reference-only container)\n`);
  }
  for (const program of result.programs) {
    printProgram(program);
  }
  if (result.programs.some(({ status }) => status === "tool-error")) {
    return EXIT.toolError;
  }
  return result.programs.some(({ status }) => status === "violations") ? EXIT.violations : EXIT.clean;
}
