#!/usr/bin/env node
// ESLint, run at the ONE profile's concurrency (tooling/concurrency-profile.json, #1835). ESLint's OWN
// default is `--concurrency off` — SINGLE-THREADED — so this is the one row in the profile that RAISES
// parallelism rather than capping it: on a box where every other cap just came down, the whole-tree lint
// leg was leaving 23 cores idle for minutes.
//
// BOTH invocation sites go through here, which is the point: `pnpm lint:eslint` (the whole-tree row) and
// the scoped `lint:eslint` stage in tooling/src/verify/lib/registry.ts. A number spelled in package.json
// would be invisible to the second, and the two would drift.
//
// Every argument after this script is forwarded verbatim, so `--max-warnings 0`, `--cache`, the path list
// and any ad-hoc flag still behave exactly as before. An explicit `--concurrency` from the caller WINS
// (a calibration run, or a deliberate single-threaded repro of a worker-only failure).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function profileConcurrency() {
  // biome-ignore lint/correctness/noProcessGlobal: CLI script
  // biome-ignore lint/style/noProcessEnv: ORB_DEDICATED_BOX is the ambient TOOLING switch (the solo-box opt-in), not app config; a .cjs launcher cannot import the app's env door.
  const raw = (process.env.ORB_DEDICATED_BOX || "").trim();
  const name = raw === "1" ? "dedicated" : "shared";
  const file = path.join(repoRoot, "tooling", "concurrency-profile.json");
  const value = JSON.parse(fs.readFileSync(file, "utf8")).profiles[name].eslintConcurrency;
  if (!Number.isInteger(value) || value < 1) {
    // Fail LOUD: an unreadable value here would silently restore the single-threaded default, and the
    // only symptom would be a slow lint nobody attributes to this file.
    throw new Error(`${file}: profiles.${name}.eslintConcurrency is ${JSON.stringify(value)} — expected a positive integer`);
  }
  return String(value);
}

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const forwarded = process.argv.slice(2);
const concurrency = forwarded.includes("--concurrency") ? [] : ["--concurrency", profileConcurrency()];
const bin = path.join(repoRoot, "node_modules", ".bin", "eslint");
const result = spawnSync(bin, [...concurrency, ...forwarded], { stdio: "inherit", cwd: repoRoot });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
