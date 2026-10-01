#!/usr/bin/env node
// The ts7 (native TypeScript 7) launcher every type-check caller goes through: `pnpm typecheck`, Vitest's
// `typecheck.checker`, the edit hook and the tooling ops, so its host-wide slot bounds all of them. Vitest spawns
// this file as an executable, so it keeps its shebang and its executable bit; node runs the TypeScript directly.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { admitTs7Run, TS7_POOL_NAME, TS7_SLOT_BUSY_EXIT, ts7SlotLabel } from "@orb/tooling/_shared/ts7-admission";

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
function incrementalOptionWidth(arg: string, next: string | undefined): number {
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

function buildInfoOptionWidth(arg: string, next: string | undefined): number {
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

function withoutIncremental(rawArgs: readonly string[]): string[] {
  const args: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index] as string;
    const next = rawArgs[index + 1];
    const width = incrementalOptionWidth(arg, next) || buildInfoOptionWidth(arg, next);
    if (width === 0) {
      args.push(arg);
    } else {
      index += width - 1;
    }
  }
  return args;
}

const args = withoutIncremental(process.argv.slice(2));
const tscPath = resolve(import.meta.dirname, "../node_modules/ts7/bin/tsc");

// THE CHECKER CAP COMES FROM THE ONE PROFILE (tooling/concurrency-profile.json, #1835), derived for this
// machine under its ceiling. It is injected HERE rather than spelled in package.json because
// `pnpm typecheck` invokes this wrapper once per discovered program, and a cap that only reaches some
// caller paths is a cap the documented invocation does not have.
// Read unconditionally so an explicit checker override cannot hide a malformed profile switch; the explicit
// flag still wins in child argv.
const profile = readConcurrencyProfile();
const checkers = args.includes("--checkers") ? [] : ["--checkers", String(profile.ts7Checkers)];

// ONE HOST-WIDE SLOT PER WHOLE-PROGRAM RUN. The notices go to stderr on lines of their own: Vitest folds this
// process's stderr into the output it parses, and a line that is not a `file(l,c): error TS…` diagnostic is
// ignored there.
const managedByIpc = process.send !== undefined;
const stop = new AbortController();
let child: ReturnType<typeof spawn> | undefined;
const cancel = (): void => {
  stop.abort();
  if (child !== undefined && child.exitCode === null && child.signalCode === null) {
    if (managedByIpc || process.platform === "win32") {
      killPidGroup(child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  }
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, cancel);
}
process.on("disconnect", cancel);
// A dev parent can disappear before this module has finished loading.
if (managedByIpc && !process.connected) {
  cancel();
}

try {
  stop.signal.throwIfAborted();
  const admission = await admitTs7Run(args, {
    label: ts7SlotLabel(args, process.cwd()),
    deps: {
      sleep: async (ms) => {
        await sleep(ms, undefined, { signal: stop.signal });
      },
      onQueued: (holder) =>
        process.stderr.write(`ts7: every host typecheck slot is taken; queued behind pid ${String(holder.pid)} (${holder.label}) since ${holder.startedAt}\n`),
      onNotice: (message) => process.stderr.write(`ts7: ${message}\n`),
    },
  });
  if (admission.kind === "busy") {
    process.stderr.write(`ts7: all ${String(admission.slots)} host "${TS7_POOL_NAME}" typecheck slots are busy; this advisory run was SKIPPED\n`);
    process.exitCode = TS7_SLOT_BUSY_EXIT;
  } else {
    try {
      stop.signal.throwIfAborted();
      // The Windows JS launcher owns a native grandchild; termination must cover the whole compiler tree.
      child = spawn(process.execPath, ["--max-old-space-size=16384", tscPath, ...checkers, ...args], {
        stdio: "inherit",
        detached: managedByIpc && process.platform !== "win32",
      });
      const status = await new Promise<number | null>((settle) => {
        child?.once("error", () => settle(null));
        child?.once("close", (code) => settle(code));
      });
      process.exitCode = status ?? ABNORMAL_COMPILER_EXIT;
    } finally {
      if (admission.kind === "admitted") {
        admission.lease.release();
      }
    }
  }
} catch (error) {
  if (!stop.signal.aborted) {
    throw error;
  }
  process.exitCode = ABNORMAL_COMPILER_EXIT;
} finally {
  if (process.connected) {
    process.disconnect?.();
  }
}
