// One native typecheck door: discover authored programs, expand references, run every leaf exactly once.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import type { SpawnNicedResult } from "@orb/tooling/floor/process/proc";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";
import { descriptorVersion } from "../../floor/code-facts/semantic-inventory-inputs.ts";
import { readCompilerPrograms } from "../../floor/compiler/compiler-programs.ts";
import type { ObservedRouterDeclarationPreparation, RouterDeclarationInputs } from "../../floor/compiler/router-declarations-contract.ts";
import { packageConfigPath } from "../../floor/compiler/type-config-intent.ts";
import type { CompilerProgram } from "../contract/policy-scope.ts";
import type { TypecheckExecutionResult, TypecheckProgramResult, TypecheckProgramStatus } from "../contract/typecheck.ts";
import { withApplicationPrograms } from "../lib/application-programs.ts";

refuseDirectInvocation(import.meta.url, "pnpm typecheck [--config <repo-relative-tsconfig>]...");

const TS7_WRAPPER = fileURLToPath(new URL("../../../../scripts/ts7.ts", import.meta.url));
const COMPILER_DIAGNOSTIC_RE = /\berror TS\d+:/u;
const NATIVE_DIAGNOSTIC_EXIT = 1;
const CLIENT_ROUTER_SOURCE = "packages/client/src/data/trpc.ts";
const routerPackageSchema = z.object({ exports: z.object({ "./router-types": z.object({ types: z.string() }) }) });
const RESULT_LABELS = {
  passed: "PASS",
  violations: "FAIL",
  "tool-error": "TOOL ERROR",
} as const satisfies Readonly<Record<TypecheckProgramStatus, string>>;

export const TYPECHECK_HELP = "usage: pnpm typecheck [--application | --config <repo-relative tsconfig path> ...]";

export function typecheckCompilerArgv(config: string): readonly string[] {
  return [TS7_WRAPPER, "--noEmit", "--pretty", "false", "-p", config];
}

function compare(left: string, right: string): number {
  return left.localeCompare(right);
}

function parseRequestedConfigs(args: readonly string[]): { readonly configs: readonly string[] | null; readonly application: boolean } {
  let values: { readonly config?: string[]; readonly application?: boolean };
  try {
    values = parseArgs({
      args: [...args],
      allowPositionals: false,
      strict: true,
      options: { config: { type: "string", multiple: true }, application: { type: "boolean" } },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  const configs = values.config?.map((config) => config.replace(/^\.\//u, "")) ?? [];
  if (values.application === true && configs.length > 0) {
    throw new UsageError("application typecheck requires the complete application population, not --config");
  }
  return { configs: configs.length === 0 ? null : [...new Set(configs)], application: values.application === true };
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

interface ClientRouterProjection {
  readonly root: string;
  readonly owner: CompilerProgram;
  readonly prepared: ObservedRouterDeclarationPreparation;
  readonly inputs: RouterDeclarationInputs;
  readonly config: string;
  readonly directory: string;
}

function assertClientProjectionCurrent(projection: ClientRouterProjection): void {
  projection.prepared.assertCurrent();
  try {
    projection.inputs.assertCurrent();
  } catch (error) {
    throw new Error("Client router typecheck projection changed; no current verdict is available.", { cause: error });
  }
  const current = readCompilerPrograms(projection.root).find(({ id }) => id === projection.owner.id);
  if (current === undefined || descriptorVersion(current) !== descriptorVersion(projection.owner)) {
    throw new Error("Client router typecheck native owner changed; no current verdict is available.");
  }
}

async function prepareClientProjection(
  root: string,
  canonical: readonly CompilerProgram[],
  selected: readonly CompilerProgram[],
  views: ReadonlyMap<string, string> | undefined,
): Promise<ClientRouterProjection | undefined> {
  const owner = selected.find((program) => program.config === packageConfigPath("client") && program.files.includes(CLIENT_ROUTER_SOURCE));
  if (owner === undefined) {
    return;
  }
  const owners = canonical.filter(({ files }) => files.includes(CLIENT_ROUTER_SOURCE));
  if (owners.length !== 1 || owners[0]?.id !== owner.id) {
    throw new Error("Client router typecheck has ambiguous native direct-root ownership.");
  }
  if (owner.commandLine.options.paths !== undefined) {
    throw new Error("Client router typecheck requires the canonical path-free options; no existing mapping may be replaced.");
  }
  const { prepareRouterDeclarations } = await import("../../floor/compiler/router-declarations.ts");
  const { routerDeclarationInputs } = await import("../../floor/compiler/router-declaration-inputs.ts");
  const inputs = routerDeclarationInputs();
  const manifest = inputs.system.readFile(join(root, "packages/server/package.json"));
  if (manifest === undefined) {
    throw new Error("Client router typecheck requires the server's public declaration export.");
  }
  const door = routerPackageSchema.parse(JSON.parse(manifest)).exports["./router-types"].types;
  for (const input of owner.configPaths) {
    inputs.system.readFile(resolve(root, input));
  }
  const view = views?.get(owner.config);
  if (views !== undefined && view === undefined) {
    throw new Error(`application compiler view is absent: ${owner.config}`);
  }
  const originalConfig = resolve(root, view ?? owner.config);
  inputs.system.readFile(originalConfig);
  const entry = resolve(root, "packages/server", door);
  // Native inherited-root queries must observe the view scaffolding before the producer captures its epoch.
  const parent = join(root, ".cache/typecheck-router");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "client-"));
  const config = join(directory, "client.json");
  try {
    const text = JSON.stringify({
      extends: originalConfig,
      compilerOptions: { paths: { "@orb/server": [entry] } },
      references: owner.commandLine.projectReferences?.map((reference) => ({ ...reference, path: reference.path })) ?? [],
    });
    writeFileSync(config, text, { flag: "wx" });
    if (inputs.system.readFile(config) !== text) {
      throw new Error("Client router typecheck projection changed while being prepared.");
    }
    const prepared = await prepareRouterDeclarations(root, [import.meta.url]);
    if (entry !== prepared.entry) {
      throw new Error("Client router typecheck public declaration export differs from the observed producer entry.");
    }
    const projection = { root, owner, prepared, inputs, config, directory };
    assertClientProjectionCurrent(projection);
    return projection;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function failedProgram(config: string, error: unknown, child?: SpawnNicedResult): TypecheckProgramResult {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = child?.stderr ?? "";
  return {
    config,
    status: "tool-error",
    code: child?.code ?? null,
    stdout: child?.stdout ?? "",
    stderr: stderr.includes(message) ? stderr : [stderr, message].filter(Boolean).join("\n"),
    timedOut: child?.timedOut ?? false,
  };
}

async function runProgram(
  program: CompilerProgram,
  runner: ProgramRunner,
  projection: ClientRouterProjection | undefined,
  views: ReadonlyMap<string, string> | undefined,
): Promise<TypecheckProgramResult> {
  const projected = projection?.owner.id === program.id ? projection : undefined;
  let child: SpawnNicedResult | undefined;
  // @orb-waive caught-failure-ownership(error): failedProgram retains native output and marks this canonical owner tool-error; runTypecheck prints it and returns exit 2. Ends if a freshness failure can produce a current verdict.
  try {
    if (projected !== undefined) {
      assertClientProjectionCurrent(projected);
    }
    let config = program.config;
    if (views !== undefined) {
      const view = views.get(program.config);
      if (view === undefined) {
        throw new Error(`application compiler view is absent: ${program.config}`);
      }
      config = view;
    }
    try {
      child = await runner(projected?.config ?? config);
    } finally {
      if (projected !== undefined) {
        assertClientProjectionCurrent(projected);
      }
    }
    return { config: program.config, status: classifyTypecheckChild(child), ...child };
  } catch (error) {
    return failedProgram(program.config, error, child);
  }
}

async function runPrograms({
  root,
  canonical,
  programs,
  concurrency,
  runner,
  views,
}: {
  readonly root: string;
  readonly canonical: readonly CompilerProgram[];
  readonly programs: readonly CompilerProgram[];
  readonly concurrency: number;
  readonly runner: ProgramRunner;
  readonly views?: ReadonlyMap<string, string>;
}): Promise<readonly TypecheckProgramResult[]> {
  const results: TypecheckProgramResult[] = [];
  let projection: ClientRouterProjection | undefined;
  let runnable = programs;
  // @orb-waive caught-failure-ownership(error): the failed client preparation is a tool-error row, while every other selected native owner still runs. Ends if preparation errors are discarded or relabeled clean.
  try {
    projection = await prepareClientProjection(root, canonical, programs, views);
  } catch (error) {
    const config = packageConfigPath("client");
    results.push(failedProgram(config, error));
    runnable = programs.filter((program) => program.config !== config);
  }
  try {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const program = runnable[cursor];
        cursor += 1;
        if (program === undefined) {
          return;
        }
        results.push(await runProgram(program, runner, projection, views));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, runnable.length) }, worker));
    if (projection !== undefined) {
      // @orb-waive caught-failure-ownership(error): preserve the child's complete result but mark its owner tool-error if the original context becomes stale before batch acceptance. Ends if the failure no longer affects runTypecheck's exit 2.
      try {
        assertClientProjectionCurrent(projection);
      } catch (error) {
        const ownerConfig = projection.owner.config;
        const index = results.findIndex(({ config }) => config === ownerConfig);
        results[index] = failedProgram(ownerConfig, error, results[index]);
      }
    }
    return results.toSorted((left, right) => compare(left.config, right.config));
  } finally {
    if (projection !== undefined) {
      rmSync(projection.directory, { recursive: true, force: true });
    }
  }
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
    programs: await runPrograms({ root, canonical: discovered, programs: runnable, concurrency, runner }),
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
  const result = requested.application
    ? await withApplicationPrograms(root, async ({ programs, canonicalPrograms }) => {
        const concurrency = readConcurrencyProfile().pnpmWorkspaceConcurrency;
        const configs = new Map(programs.map((program) => [program.owner.config, program.config]));
        const runner = async (config: string): Promise<SpawnNicedResult> => await spawnNiced(process.execPath, typecheckCompilerArgv(config), { cwd: root });
        return {
          discovered: canonicalPrograms.length,
          requested: null,
          skippedContainers: [],
          programs: await runPrograms({
            root,
            canonical: canonicalPrograms,
            programs: programs.map(({ owner }) => owner),
            concurrency,
            runner,
            views: configs,
          }),
          concurrency,
        };
      })
    : await executeTypecheckPrograms(root, requested.configs);
  process.stdout.write(
    `typecheck${requested.application ? " application" : ""} — ${String(result.discovered)} discovered, ${String(result.programs.length)} runnable, concurrency ${String(result.concurrency)}\n`,
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
