#!/usr/bin/env node
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const args = process.argv.slice(2);
const tscPath = path.resolve(__dirname, "../node_modules/ts7/bin/tsc");
// biome-ignore lint/correctness/noProcessGlobal: CLI script
const result = spawnSync(process.execPath, [tscPath, ...args], { stdio: "inherit" });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
