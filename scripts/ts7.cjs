#!/usr/bin/env node
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readConcurrencyProfile } = require("@orb/tooling/_shared/concurrency-profile");

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const args = process.argv.slice(2);
const tscPath = path.resolve(__dirname, "../node_modules/ts7/bin/tsc");

// THE CHECKER CAP COMES FROM THE ONE PROFILE (tooling/concurrency-profile.json, #1835) — 4 checkers on a
// shared host, 8 under ORB_DEDICATED_BOX=1. It is injected HERE rather than spelled in package.json because
// `node scripts/ts7.cjs --noEmit -p tsconfig.json` is how every brief and standing fact spells types:graph,
// and a cap that only reaches the pnpm rows is a cap the documented invocation does not have.
// Node 26 loads the public typed door synchronously from CommonJS. Read unconditionally so an explicit
// checker override cannot hide a malformed profile switch; the explicit flag still wins in child argv.
const profile = readConcurrencyProfile();
const checkers = args.includes("--checkers") ? [] : ["--checkers", String(profile.ts7Checkers)];

// The heap floor rides IN the wrapper so bare `node scripts/ts7.cjs` invocations (how briefs spell
// types:graph) get it too — pnpm-workspace.yaml's nodeOptions only reaches pnpm-run scripts. An
// explicit caller flag still wins (command line beats an inherited NODE_OPTIONS default).
// biome-ignore lint/correctness/noProcessGlobal: CLI script
const result = spawnSync(process.execPath, ["--max-old-space-size=16384", tscPath, ...checkers, ...args], { stdio: "inherit" });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
