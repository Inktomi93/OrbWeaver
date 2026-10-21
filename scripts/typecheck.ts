import { spawn } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const operands = process.argv.slice(2);
const configs =
  operands.length > 0
    ? operands
    : [
        ...globSync("packages/*/tsconfig*.json", { cwd: root }).sort(),
        "tooling/tsconfig.json",
        "tsconfig.json",
        "tsconfig.tests-dom.json",
        "tsconfig.tests-iso.json",
      ];
for (const config of configs) {
  if (config.startsWith("-") || !config.endsWith(".json") || !statSync(resolve(root, config)).isFile()) {
    throw new Error(`Expected a tsconfig file, received ${JSON.stringify(config)}`);
  }
}

// Independent -p programs cannot share a compiler invocation; serial runs bound their memory footprint.
for (const config of configs) {
  console.log(`typecheck ${config}`);
  const child = spawn(process.execPath, [resolve(root, "node_modules/@typescript/native/bin/tsc"), "--noEmit", "--incremental", "false", "--project", config], {
    cwd: root,
    stdio: "inherit",
  });
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
  }
}
