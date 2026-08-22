#!/usr/bin/env node
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const args = process.argv.slice(2);
const tscPath = path.resolve(__dirname, "../node_modules/ts7/bin/tsc");
// The heap floor rides IN the wrapper so bare `node scripts/ts7.cjs` invocations (how briefs spell
// types:graph) get it too — pnpm-workspace.yaml's nodeOptions only reaches pnpm-run scripts. An
// explicit caller flag still wins (command line beats an inherited NODE_OPTIONS default).
// biome-ignore lint/correctness/noProcessGlobal: CLI script
const result = spawnSync(process.execPath, ["--max-old-space-size=16384", tscPath, ...args], { stdio: "inherit" });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
