import { spawn } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";

// Usage: pnpm typecheck [tsconfig.json ...] [--extendedDiagnostics] [--generateTrace=<dir>]
//   --extendedDiagnostics   print the compiler's own counts, memory and per-phase times after each program.
//   --generateTrace=<dir>   write each program's trace and type list to <dir>/<program slug>/, so programs never overwrite each other.
// The compiler also takes --pprofDir <dir> for CPU and memory profiles; it is a manual option, run as
// `node node_modules/@typescript/native/bin/tsc --noEmit true --incremental false --pprofDir <dir> --project <tsconfig>`.
const EXTENDED_DIAGNOSTICS_FLAG = "--extendedDiagnostics";
const GENERATE_TRACE_FLAG = "--generateTrace";
const GENERATE_TRACE_PREFIX = `${GENERATE_TRACE_FLAG}=`;

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const extendedDiagnostics = args.includes(EXTENDED_DIAGNOSTICS_FLAG);
const traceArg = args.find((arg) => arg.startsWith(GENERATE_TRACE_PREFIX));
const traceDir = traceArg?.slice(GENERATE_TRACE_PREFIX.length);
if (traceDir === "") {
  throw new Error(`${GENERATE_TRACE_FLAG} needs a directory: ${GENERATE_TRACE_PREFIX}<dir>`);
}
const traceRoot = traceDir === undefined ? undefined : resolve(root, traceDir);
const operands = args.filter((arg) => arg !== EXTENDED_DIAGNOSTICS_FLAG && arg !== traceArg);
const routerConfig = "packages/server/tsconfig.router.json";
const routerConsumers = ["packages/client/tsconfig.json", "tooling/tsconfig.json", "tsconfig.node.json", "tsconfig.tests-dom.json"].map((config) =>
  resolve(root, config),
);
const configs =
  operands.length > 0
    ? operands
    : [
        ...globSync("packages/*/tsconfig*.json", { cwd: root })
          .filter((config) => config !== routerConfig)
          .sort(),
        "tooling/tsconfig.json",
        "tooling/src/codemods/tsconfig.json",
        "tsconfig.node.json",
        "tsconfig.tests-dom.json",
        "tsconfig.tests-iso.json",
      ];
for (const config of configs) {
  if (config.startsWith("-") || !config.endsWith(".json") || !statSync(resolve(root, config)).isFile()) {
    throw new Error(`Expected a tsconfig file, received ${JSON.stringify(config)}`);
  }
  // The root tsconfig.json is the solution file: it compiles nothing, so checking it would pass vacuously.
  if (resolve(root, config) === resolve(root, "tsconfig.json")) {
    throw new Error("tsconfig.json is the solution file and compiles nothing; check the Node world with tsconfig.node.json");
  }
}

// A program's trace directory name: its config path from the repo root with separators folded, so each program owns one.
function programSlug(config: string): string {
  return relative(root, resolve(root, config))
    .replaceAll(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

// Refresh the public declaration before its consumers, never for an unrelated scoped package check.
const programs = configs.some((config) => routerConsumers.includes(resolve(root, config))) ? [routerConfig, ...configs] : configs;
// Independent -p programs cannot share a compiler invocation; serial runs bound their memory footprint.
for (const config of programs) {
  console.log(`typecheck ${config}`);
  const child = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/@typescript/native/bin/tsc"),
      "--noEmit",
      String(resolve(root, config) !== resolve(root, routerConfig)),
      "--incremental",
      "false",
      "--project",
      config,
      ...(extendedDiagnostics ? [EXTENDED_DIAGNOSTICS_FLAG] : []),
      ...(traceRoot === undefined ? [] : [GENERATE_TRACE_FLAG, resolve(traceRoot, programSlug(config))]),
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  let interrupted: NodeJS.Signals | undefined;
  const forward = (signal: NodeJS.Signals): void => {
    interrupted = signal;
    child.kill(signal);
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  for (const signal of signals) {
    process.on(signal, forward);
  }
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((settle, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => settle({ code, signal }));
  }).finally(() => {
    for (const signal of signals) {
      process.off(signal, forward);
    }
  });
  const termination = interrupted ?? result.signal;
  if (termination !== null) {
    process.kill(process.pid, termination);
    break;
  }
  if (result.code !== 0) {
    process.exitCode ??= result.code ?? 1;
    if (resolve(root, config) === resolve(root, routerConfig)) {
      break;
    }
  }
}
