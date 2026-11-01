// Whole-tree ESLint for the local 128 GB box only: CI and pre-push keep the plain `lint:eslint` and its heap.
// Runs `packages`, `tests`, `tooling` and the remainder as sequential processes, so one program's memory is
// released before the next starts, each with worker threads. Any argument runs one box-sized ESLint instead.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
// Box-only. V8 applies this flag to every worker thread, so each of the WORKERS holds up to this heap.
const BOX_HEAP_MB = 32_768;
const WORKERS = 3;
const TREES = ["packages", "tests", "tooling"];
const PARTS: readonly (readonly string[])[] = [...TREES.map((tree) => [tree]), [".", ...TREES.flatMap((tree) => ["--ignore-pattern", `${tree}/`])]];

function lint(targets: readonly string[]): number {
  const result = spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${BOX_HEAP_MB}`,
      resolve(root, "node_modules/eslint/bin/eslint.js"),
      "--flag",
      "unstable_native_nodejs_ts_config",
      "--max-warnings",
      "0",
      `--concurrency=${WORKERS}`,
      ...targets,
    ],
    { cwd: root, stdio: "inherit" },
  );
  // A signal (an OOM kill, a crash) has no status; it must still fail the run.
  return result.status ?? 1;
}

const operands = process.argv.slice(2);
const parts = operands.length > 0 ? [operands] : PARTS;
const failed = parts.filter((part) => {
  console.log(`eslint ${part.join(" ")}`);
  return lint(part) !== 0;
});
if (failed.length > 0) {
  console.error(`eslint failed in: ${failed.map((part) => part[0]).join(", ")}`);
  process.exit(1);
}
