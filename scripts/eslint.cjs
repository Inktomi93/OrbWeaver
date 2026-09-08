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
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readConcurrencyProfile } = require("@orb/tooling/_shared/concurrency-profile");

const repoRoot = path.resolve(__dirname, "..");

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const forwarded = process.argv.slice(2);
// Validate the profile before applying a caller override; malformed environment never silently degrades.
const profile = readConcurrencyProfile();
const concurrency = forwarded.includes("--concurrency") ? [] : ["--concurrency", String(profile.eslintConcurrency)];
const bin = path.join(repoRoot, "node_modules", ".bin", "eslint");
const result = spawnSync(bin, [...concurrency, ...forwarded], { stdio: "inherit", cwd: repoRoot });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
