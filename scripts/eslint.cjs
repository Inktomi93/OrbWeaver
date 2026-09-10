#!/usr/bin/env node
// ESLint, run at the ONE profile's concurrency (tooling/concurrency-profile.json, #1835). ESLint's OWN
// default is `--concurrency off` — SINGLE-THREADED — so this is the one row in the profile that RAISES
// parallelism rather than capping it: on a box where every other cap just came down, the whole-tree lint
// leg was leaving 23 cores idle for minutes.
//
// Scoped and ad-hoc invocations go through here. The whole-tree verify operation partitions files into
// sequential compiler-owner processes, then uses this same adapter for every native ESLint child.
//
// Every argument after this script is forwarded verbatim, so `--max-warnings 0`, `--cache`, the path list
// and any ad-hoc flag still behave exactly as before. An explicit `--concurrency` from the caller WINS
// (a calibration run, or a deliberate single-threaded repro of a worker-only failure).
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readConcurrencyProfile } = require("@orb/tooling/_shared/concurrency-profile");

const repoRoot = path.resolve(__dirname, "..");

function exitCodeForSpawnResult(result) {
  if (result.error !== undefined) {
    console.error(`[eslint-launcher] failed to start ESLint: ${result.error.message}`);
    return 2;
  }
  if (result.signal !== null) {
    console.error(`[eslint-launcher] ESLint terminated by signal ${result.signal ?? "unknown"}`);
    return 2;
  }
  return result.status ?? 2;
}

function main() {
  // biome-ignore lint/correctness/noProcessGlobal: CLI script
  const forwarded = process.argv.slice(2);
  // Validate the profile before applying a caller override; malformed environment never silently degrades.
  const profile = readConcurrencyProfile();
  const concurrency = forwarded.includes("--concurrency") ? [] : ["--concurrency", String(profile.eslintConcurrency)];
  const bin = path.join(repoRoot, "node_modules", ".bin", "eslint");
  return exitCodeForSpawnResult(spawnSync(bin, [...concurrency, ...forwarded], { stdio: "inherit", cwd: repoRoot }));
}

let exitCode;
try {
  exitCode = main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[eslint-launcher] launcher configuration refused the run: ${message}`);
  exitCode = 2;
}
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(exitCode);
