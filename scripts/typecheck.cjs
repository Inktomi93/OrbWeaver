#!/usr/bin/env node
// `pnpm typecheck` — the PER-PACKAGE type program, run across the workspace at the concurrency the ONE
// profile allows (tooling/concurrency-profile.json, #1835): 1 package at a time on a shared host, 4 under
// ORB_DEDICATED_BOX=1. Each package then runs ts7 with its own `--checkers` cap, which scripts/ts7.cjs
// injects from the same profile — so the worst case is `workspaceConcurrency × checkers` busy cores, and
// both halves come from one file instead of two literals in a package.json script string.
//
// WHY A SCRIPT AND NOT A LITERAL. `pnpm -r --workspace-concurrency=4 … --checkers 8` was the shipped
// spelling: 4 packages × 8 checkers = up to 32 CPU-bound processes from ONE lane, on a 24-core box that
// routinely hosts six lanes. Putting the numbers in the profile means they cannot be changed in one reader
// and forgotten in the others; putting the SPAWN here means package.json holds no number at all.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readConcurrencyProfile } = require("@orb/tooling/_shared/concurrency-profile");

const repoRoot = path.resolve(__dirname, "..");

const profile = readConcurrencyProfile();

// `--no-bail`: every package reports, so one red does not hide the others (the pre-existing contract).
// `$PWD/scripts/ts7.cjs` was the old spelling and is deliberately replaced by an absolute path resolved
// HERE — `pnpm -r exec` runs each child with cwd = that package, so a relative path would resolve wrong,
// and $PWD only worked because the row was always invoked from the repo root.
const argv = [
  "-r",
  "--no-bail",
  `--workspace-concurrency=${String(profile.pnpmWorkspaceConcurrency)}`,
  "exec",
  "node",
  path.join(repoRoot, "scripts", "ts7.cjs"),
  "--noEmit",
  "--pretty",
  "false",
  // biome-ignore lint/correctness/noProcessGlobal: CLI script
  ...process.argv.slice(2),
];
const result = spawnSync("pnpm", argv, { stdio: "inherit", cwd: repoRoot });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
