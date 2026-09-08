#!/usr/bin/env node
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readConcurrencyProfile } = require("@orb/tooling/_shared/concurrency-profile");

const INCREMENTAL_OPTION = "--incremental";
const INCREMENTAL_SHORT_OPTION = "-i";
const BUILD_INFO_OPTION = "--tsBuildInfoFile";
// A native child that died by signal or failed to spawn has no numeric status. Preserve that abnormal
// class across this wrapper as a reserved non-compiler exit; folding it to 1 makes diagnostic-looking
// partial output indistinguishable from an ordinary type error.
const ABNORMAL_COMPILER_EXIT = 70;

// Vitest unconditionally adds incremental flags to typecheck projects. Native TS7 can retain a stale
// semantic verdict when an imported `/// <reference lib>` widens the global program, so this wrapper keeps
// every TS7 invocation on the repo's cold-check policy regardless of the caller's defaults.
function incrementalOptionWidth(arg, next) {
  const normalized = arg.toLowerCase();
  const normalizedNext = next?.toLowerCase();
  if (normalized === INCREMENTAL_OPTION.toLowerCase() || normalized === INCREMENTAL_SHORT_OPTION) {
    return normalizedNext === "true" || normalizedNext === "false" ? 2 : 1;
  }
  if (normalized.startsWith(`${INCREMENTAL_SHORT_OPTION}=`)) {
    throw new Error(`${INCREMENTAL_SHORT_OPTION} does not accept an equals-form value; use a bare flag or a separate true/false value`);
  }
  if (!normalized.startsWith(`${INCREMENTAL_OPTION.toLowerCase()}=`)) {
    return 0;
  }
  const value = normalized.slice(INCREMENTAL_OPTION.length + 1);
  if (value !== "true" && value !== "false") {
    throw new Error(`${INCREMENTAL_OPTION} expects true or false, received ${JSON.stringify(value)}`);
  }
  return 1;
}

function buildInfoOptionWidth(arg, next) {
  const normalized = arg.toLowerCase();
  if (normalized === BUILD_INFO_OPTION.toLowerCase()) {
    if (next === undefined || next.length === 0 || next.startsWith("-")) {
      throw new Error(`${BUILD_INFO_OPTION} requires a path value`);
    }
    return 2;
  }
  if (!normalized.startsWith(`${BUILD_INFO_OPTION.toLowerCase()}=`)) {
    return 0;
  }
  const value = normalized.slice(BUILD_INFO_OPTION.length + 1);
  if (value.length === 0) {
    throw new Error(`${BUILD_INFO_OPTION} requires a path value`);
  }
  return 1;
}

function withoutIncremental(rawArgs) {
  const args = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const width = incrementalOptionWidth(rawArgs[index], rawArgs[index + 1]) || buildInfoOptionWidth(rawArgs[index], rawArgs[index + 1]);
    if (width === 0) {
      args.push(rawArgs[index]);
    } else {
      index += width - 1;
    }
  }
  return args;
}

// biome-ignore lint/correctness/noProcessGlobal: CLI script
const args = withoutIncremental(process.argv.slice(2));
const tscPath = path.resolve(__dirname, "../node_modules/ts7/bin/tsc");

// THE CHECKER CAP COMES FROM THE ONE PROFILE (tooling/concurrency-profile.json, #1835) — 4 checkers on a
// shared host, 8 under ORB_DEDICATED_BOX=1. It is injected HERE rather than spelled in package.json because
// `pnpm typecheck` invokes this wrapper once per discovered program, and a cap that only reaches some
// caller paths is a cap the documented invocation does not have.
// Node 26 loads the public typed door synchronously from CommonJS. Read unconditionally so an explicit
// checker override cannot hide a malformed profile switch; the explicit flag still wins in child argv.
const profile = readConcurrencyProfile();
const checkers = args.includes("--checkers") ? [] : ["--checkers", String(profile.ts7Checkers)];

// Give the Node launcher its heap allowance even when the caller did not inherit pnpm's NODE_OPTIONS.
// biome-ignore lint/correctness/noProcessGlobal: CLI script
const result = spawnSync(process.execPath, ["--max-old-space-size=16384", tscPath, ...checkers, ...args], { stdio: "inherit" });
// biome-ignore lint/correctness/noProcessGlobal: CLI script
process.exit(result.status ?? ABNORMAL_COMPILER_EXIT);
