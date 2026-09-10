#!/usr/bin/env node
// jscpd v5 defaults to every available core. Route both CPD commands through the host profile while
// preserving a caller's explicit native override and every other CLI argument verbatim.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

function nativeEntry(): string {
  const manifestUrl = import.meta.resolve("jscpd/package.json");
  const manifest = JSON.parse(readFileSync(new URL(manifestUrl), "utf8")) as { readonly bin: { readonly jscpd: string } };
  return fileURLToPath(new URL(manifest.bin.jscpd, manifestUrl));
}

function run(): number {
  let workers: number;
  let binary: string;
  try {
    workers = readConcurrencyProfile().cpdWorkers;
    binary = nativeEntry();
  } catch (error) {
    process.stderr.write(`cpd: launcher configuration refused the run — ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_TOOL_ERROR;
  }

  const args = process.argv.slice(2);
  const hasWorkerOverride = args.some((arg) => arg === "--workers" || arg.startsWith("--workers="));
  const workerArgv = hasWorkerOverride ? [] : ["--workers", String(workers)];
  const result = spawnSync(process.execPath, [binary, ...workerArgv, ...args], { cwd: join(import.meta.dirname, ".."), stdio: "inherit" });
  if (result.error !== undefined) {
    process.stderr.write(`cpd: failed to spawn ${binary} — ${result.error.message}\n`);
    return EXIT_TOOL_ERROR;
  }
  if (result.signal !== null) {
    process.stderr.write(`cpd: jscpd terminated by signal ${result.signal ?? "unknown"}; no duplication verdict was produced\n`);
    return EXIT_TOOL_ERROR;
  }
  if (result.status === EXIT_CLEAN || result.status === EXIT_VIOLATIONS) {
    return result.status;
  }
  process.stderr.write(`cpd: jscpd exited ${String(result.status)}; only native exits 0 and 1 are duplication verdicts\n`);
  return EXIT_TOOL_ERROR;
}

process.exitCode = run();
