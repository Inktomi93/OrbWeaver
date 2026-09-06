#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const args = process.argv.slice(2);
const tscPath = path.resolve(__dirname, "../node_modules/ts7/bin/tsc");

// THE CHECKER CAP COMES FROM THE ONE PROFILE (tooling/concurrency-profile.json, #1835) — 4 checkers on a
// shared host, 8 under ORB_DEDICATED_BOX=1. It is injected HERE rather than spelled in package.json because
// `node scripts/ts7.cjs --noEmit -p tsconfig.json` is how every brief and standing fact spells types:graph,
// and a cap that only reaches the pnpm rows is a cap the documented invocation does not have. This is a
// .cjs, so it reads the JSON directly rather than through the TypeScript door — which is exactly why the
// profile is JSON. An EXPLICIT `--checkers` from the caller always wins (a calibration run overrides).
function profileCheckers() {
  // biome-ignore lint/correctness/noProcessGlobal: CLI script
  // biome-ignore lint/style/noProcessEnv: ORB_DEDICATED_BOX is the ambient TOOLING switch (the solo-box opt-in), not app config; a .cjs launcher cannot import the app's env door.
  const raw = (process.env.ORB_DEDICATED_BOX || "").trim();
  const name = raw === "1" ? "dedicated" : "shared";
  const file = path.resolve(__dirname, "../tooling/concurrency-profile.json");
  const value = JSON.parse(fs.readFileSync(file, "utf8")).profiles[name].ts7Checkers;
  if (!Number.isInteger(value) || value < 1) {
    // Fail LOUD, never silently uncapped: an unreadable cap is how a "capped" fleet quietly stops being one.
    throw new Error(`${file}: profiles.${name}.ts7Checkers is ${JSON.stringify(value)} — expected a positive integer`);
  }
  return String(value);
}
const checkers = args.includes("--checkers") ? [] : ["--checkers", profileCheckers()];

// The heap floor rides IN the wrapper so bare `node scripts/ts7.cjs` invocations (how briefs spell
// types:graph) get it too — pnpm-workspace.yaml's nodeOptions only reaches pnpm-run scripts. An
// explicit caller flag still wins (command line beats an inherited NODE_OPTIONS default).
// biome-ignore lint/correctness/noProcessGlobal: CLI script
const result = spawnSync(process.execPath, ["--max-old-space-size=16384", tscPath, ...checkers, ...args], { stdio: "inherit" });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? 1);
