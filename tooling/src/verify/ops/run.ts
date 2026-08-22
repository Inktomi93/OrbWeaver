// `pnpm verify` — the ONE verification entry (UNIFIED-VERIFICATION-DESIGN.md §3). Four tiers, one scope
// convention, one exit contract, one summary/artifact, generalized over the self-describing stage registry.
//
//   pnpm verify              → --static  (today's `pnpm check`, byte-compatible)
//   pnpm verify --changed    → the inner loop (scoped, related tests)
//   pnpm verify --static     → the pre-commit bundle (= `pnpm check`)
//   pnpm verify --push       → static + node tests + CT + e2e-smoke (the pre-push bar)
//   pnpm verify --full       → push + cpd + full e2e + parity + mutation-gate
//   pnpm verify --list       → print every registry row (incl. manual) with its tiers/reason
//   pnpm verify --json       → mirror reports/verify.json to stdout
//   pnpm verify --file <p…>  → scoped to explicit paths (the check:file muscle memory)
//   pnpm verify --package <n> / --scope <glob> / --tier <name>  → package / folder / explicit-tier scope
//   pnpm verify --strict-scope  → a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring
//   pnpm verify --verbose    → stream each stage's full output live (default: COMPACT — a per-stage ✓/✗
//                              line only; full output goes to the logs + json, so the console survives any
//                              head/tail truncation. Verbose is EXPLICIT-only: TTY auto-detection is gone —
//                              a git hook's stdout is a TTY too, and auto-verbose blasted every push)
//
// ARGV is parsed by ../lib/run-argv.ts under a strict schema: an unknown flag, a value option with no
// value, >1 scope selector, or >1 tier are all misuse (exit 3), never a silent-ignore.
//
// CHRONOLOGICAL STAGE TRANSCRIPT: a stage's stdout and stderr are captured INTERLEAVED, in arrival order
// (`_shared/proc.ts` spawnNicedTranscript), so the END of reports/verify/<stage>.log — and the
// failureExcerpt cut from it — is the END OF THE RUN. Concatenating whole streams instead (the pre-#259
// `stdout + stderr`) put the tail of STDERR last: for `tests:node` that was pnpm's `$ …` banner plus node
// ExperimentalWarnings, while playwright's CT verdict sat mid-file — a real CT failure read as a silent
// death for three diagnoses.
//
// EXIT CONTRACT (§3.3): 0 clean · 1 violations · 2 tool error · 3 misuse. Run exit = max severity over
// stages. A whole-only stage the scope can't run is DEFERRED with a printed notice, unless --strict-scope
// makes it a refusal.
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ensureReportsDir, reportsPath, reportsRelPath } from "@orb/tooling/_shared/artifacts";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import type { RunHistoryEntry } from "../contract/history.ts";
import type { Selection } from "../contract/selection.ts";
import type { StageDef, StageMode, StageResult, VerifyReport } from "../contract/stage.ts";
import { aggregateExit } from "../lib/exit-classifiers.ts";
import { appendHistory, currentSha, previousAtTier, readHistory, slowdownLines, slowdowns } from "../lib/history.ts";
import { stagesForTier } from "../lib/registry.ts";
import type { Parsed } from "../lib/run-argv.ts";
import { printHeadBanner, printList, printSummary, stageLine } from "../lib/run-render.ts";

/** Resolve how a stage runs at this tier+scope: its concrete argv, or a mode sentinel. */
function planStage(
  stage: StageDef,
  selection: Selection | undefined,
): {
  readonly mode: StageMode;
  readonly argv: readonly [string, ...string[]] | null;
  readonly runsAt: string | null;
} {
  if (selection === undefined) {
    return { mode: "full", argv: stage.argv, runsAt: null };
  }
  // Scoped run: a stage with no scopedArgv is whole-only ⇒ deferred.
  if (stage.scopedArgv === undefined) {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  const scoped = stage.scopedArgv(selection);
  if (scoped === "whole-only") {
    return { mode: "deferred", argv: null, runsAt: pushOrStatic(stage) };
  }
  if (scoped === "skip-empty") {
    return { mode: "skipped", argv: null, runsAt: null };
  }
  return { mode: "scoped", argv: scoped, runsAt: null };
}

/** The tier a deferred stage runs at — the lowest non-changed tier it belongs to (for the notice). */
function pushOrStatic(stage: StageDef): string {
  for (const t of ["static", "push", "full"] as const) {
    if (stage.tiers.includes(t)) {
      return `verify --${t}`;
    }
  }
  return "verify --full";
}

function logPathFor(stageName: string): string {
  return reportsRelPath("verify", `${stageName.replace(/:/gu, "-")}.log`);
}

// A monotonic counter over this process's atomic writes — combined with the pid it makes a temp name that
// cannot collide with a CONCURRENT verify run (different pid) or an EARLIER write in THIS run (different n).
let atomicWriteSeq = 0;

/** Write `content` to `absPath` atomically: write to a unique temp file in the SAME directory (same
 *  filesystem ⇒ POSIX rename is atomic), then renameSync over the target. A concurrent reader always sees
 *  either the old complete file or the new complete file — never a torn write. No lock, no blocking: two
 *  concurrent verify runs both succeed, last writer wins (intended — concurrent commits must not block). */
function writeFileAtomic(absPath: string, content: string): void {
  atomicWriteSeq += 1;
  const tmp = `${absPath}.tmp.${process.pid}.${atomicWriteSeq}`;
  writeFileSync(tmp, content);
  renameSync(tmp, absPath);
}

// A whole-scope stage runs `pnpm <script>` (pnpm resolves the workspace bin). A scoped stage invokes a
// bin DIRECTLY (biome/eslint/tsc/depcruise/vitest) — with shell:false those aren't on PATH, so resolve
// them against node_modules/.bin. `pnpm`/`node` stay as-is (PATH-resolved).
const PATH_RESOLVED = new Set(["pnpm", "node"]);

function resolveBin(root: string, cmd: string): string {
  return PATH_RESOLVED.has(cmd) ? cmd : join(root, "node_modules", ".bin", cmd);
}

const EXCERPT_LINES = 8; // failure excerpt: the last N non-blank output lines (where tools print the verdict).

/** The tail of a failed stage's output — the last few non-blank lines, where tsc/biome/vitest/playwright
 *  print their error summary. Lands in reports/verify.json + the tail console block so a bot never has to
 *  open the per-stage log to learn WHY a stage failed. */
function failureExcerpt(output: string): string {
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(-EXCERPT_LINES).join("\n");
}

async function runOneStage(root: string, stage: StageDef, selection: Selection | undefined, verbose: boolean): Promise<StageResult> {
  const plan = planStage(stage, selection);
  if (plan.mode === "deferred" || plan.mode === "skipped") {
    return {
      name: stage.name,
      group: stage.group,
      mode: plan.mode,
      ok: true, // a deferred/skipped stage is not a failure — it just didn't run here
      exitCode: EXIT.clean,
      durationMs: 0,
      logFile: null,
      failureExcerpt: null,
      runsAt: plan.runsAt,
    };
  }
  const argv = plan.argv as readonly [string, ...string[]];
  const header = `\n=== ${stage.name} (${argv.join(" ")})${plan.mode === "scoped" ? " [scoped]" : ""} ===\n`;
  // Compact mode (default): the full stage output goes to the per-stage log + json ONLY — the console stays
  // short enough to survive any head/tail. Verbose (--verbose): stream the header + output live.
  if (verbose) {
    process.stdout.write(header);
  }

  const start = Date.now();
  const [cmd, ...args] = argv;
  // NO_COLOR only — setting FORCE_COLOR alongside it (even "0") makes node WARN per child process that
  // NO_COLOR is ignored (13 warnings per push run, 2026-07-17); every gate tool honors NO_COLOR alone.
  // biome-ignore lint/style/noProcessEnv: NO_COLOR passthrough to children — greppable plain output, not config.
  const env = { ...process.env, ...Object.fromEntries([["NO_COLOR", "1"]]), ...stage.env };
  const result = await spawnNicedTranscript(resolveBin(root, cmd), args, {
    cwd: root,
    env,
    ...(verbose ? { onChunk: mirrorChunk } : {}),
  });
  const durationMs = Date.now() - start;

  const body = result.transcript;
  const logFile = logPathFor(stage.name);
  writeFileAtomic(join(root, logFile), `${header}${body}`);

  const exitCode = stage.classify(result.code);
  const ok = exitCode === EXIT.clean;
  const line = stageLine({
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok,
    exitCode,
    durationMs,
    logFile,
    failureExcerpt: null,
    runsAt: null,
  });
  // In compact mode, emit the per-stage ✓/✗ line the instant the stage finishes — the reader watches
  // progress accrue without the full output. (Verbose already streamed it; the summary block repeats it.)
  if (!verbose) {
    process.stdout.write(`${line}\n`);
  }
  return {
    name: stage.name,
    group: stage.group,
    mode: plan.mode,
    ok,
    exitCode,
    durationMs,
    logFile,
    failureExcerpt: ok ? null : failureExcerpt(body),
    runsAt: null,
  };
}

/** --verbose's live mirror: each chunk goes back out on the stream it arrived on. */
function mirrorChunk(chunk: string, stream: "stdout" | "stderr"): void {
  if (stream === "stdout") {
    process.stdout.write(chunk);
    return;
  }
  process.stderr.write(chunk);
}

function writeReport(root: string, report: VerifyReport): void {
  writeFileAtomic(reportsPath(root, "verify.json"), `${JSON.stringify(report, null, 2)}\n`);
}

/** The run's scope label for the banner + the artifact. */
function scopeLabel(parsed: Parsed): string {
  return parsed.selection === undefined ? "whole" : parsed.selection.label;
}

async function runTier(root: string, parsed: Parsed): Promise<VerifyReport> {
  ensureReportsDir(root, "verify");
  printHeadBanner(parsed.tier, scopeLabel(parsed));

  const stages = stagesForTier(parsed.tier);
  const results: StageResult[] = [];
  for (const stage of stages) {
    const plan = planStage(stage, parsed.selection);
    // --strict-scope: a whole-only stage under a scoped tier is a REFUSAL (misuse), not a deferral.
    if (parsed.strictScope && plan.mode === "deferred") {
      results.push({
        name: stage.name,
        group: stage.group,
        mode: "deferred",
        ok: false,
        exitCode: EXIT.misuse,
        durationMs: 0,
        logFile: null,
        failureExcerpt: null,
        runsAt: plan.runsAt,
      });
      continue;
    }
    // Sequential BY DESIGN: stages share the CPU, the reports dir and the console — they run one at a
    // time in registry order, exactly as the old sync loop ran them. The await IS the ordering.
    // biome-ignore lint/performance/noAwaitInLoops: serialized stage execution is the contract, not a missed parallelism.
    results.push(await runOneStage(root, stage, parsed.selection, parsed.verbose));
  }

  const exitCode = aggregateExit(results.map((s) => s.exitCode));
  return {
    tier: parsed.tier,
    scope: scopeLabel(parsed),
    ok: exitCode === EXIT.clean,
    exitCode,
    failed: results.filter((s) => !s.ok).length,
    stages: results,
  };
}

/** This run's history line (#411) — recorded BEFORE the comparison so the file is the ledger even when the
 *  comparison has nothing to say. `runId` ties the line back to the artifact it measured. */
function historyEntry(root: string, report: VerifyReport): RunHistoryEntry {
  return {
    runId: `${process.pid}-${new Date().toISOString()}`,
    at: new Date().toISOString(),
    tier: report.tier,
    scope: report.scope,
    sha: currentSha(root),
    exitCode: report.exitCode,
    totalMs: report.stages.reduce((n, s) => n + s.durationMs, 0),
    stages: report.stages.map((s) => ({ name: s.name, mode: s.mode, durationMs: s.durationMs })),
  };
}

/** The `verify` verb: run a tier, write reports/verify.json, retain the run's timings, print the
 *  truncation-robust summary, and return the run's exit code (the cli's runTool owns the process exit —
 *  never a bare process.exit here, which would drop the unflushed summary). */
export async function runVerify(root: string, parsed: Parsed): Promise<number> {
  if (parsed.list) {
    printList();
    return EXIT.clean;
  }
  const report = await runTier(root, parsed);
  writeReport(root, report);

  // #411: retain, then compare against the previous run AT THE SAME TIER. The advisory prints BEFORE the
  // summary block so the truncation-robust tail (the verdict + the artifact pointer) stays last.
  const entry = historyEntry(root, report);
  const previous = previousAtTier(readHistory(root), report.tier, entry.runId);
  appendHistory(root, entry);
  for (const line of slowdownLines(previous, slowdowns(previous, entry))) {
    process.stdout.write(`${line}\n`);
  }

  printSummary(report);
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  return report.exitCode;
}
