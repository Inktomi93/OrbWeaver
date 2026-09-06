// `pnpm verify` — the ONE verification entry (UNIFIED-VERIFICATION-DESIGN.md §3). Four tiers, one scope
// convention, one exit contract, one summary/artifact, generalized over the self-describing stage registry.
//
//   pnpm verify              → --static  (today's `pnpm check`, byte-compatible)
//   pnpm verify --changed    → the inner loop (scoped, related tests)
//   pnpm verify --static     → the pre-commit bundle (= `pnpm check`)
//   pnpm verify --push       → static + node tests + CT + e2e-smoke (the pre-push bar)
//   pnpm verify --full       → push + cpd + full e2e + mutation-gate
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
//
// A WHOLE RUN QUEUES HOST-WIDE (#1835) — `../lib/whole-run-queue.ts` owns that decision and its why.
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { checkoutName, openRunSlot, publishRunSlot, runFile } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import type { RunHistoryEntry } from "../contract/history.ts";
import type { Selection } from "../contract/selection.ts";
import type { StageDef, StageMode, StageResult, Tier, TranscriptAudit, VerifyReport } from "../contract/stage.ts";
import { aggregateExit } from "../lib/exit-classifiers.ts";
import { appendHistory, currentSha, previousAtTier, readHistory, slowdownLines, slowdowns } from "../lib/history.ts";
import { stagesForTier } from "../lib/registry.ts";
import type { Parsed } from "../lib/run-argv.ts";
import { printHeadBanner, printList, printSummary, stageLine } from "../lib/run-render.ts";
import { enterWholeRunQueue } from "../lib/whole-run-queue.ts";

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm verify [--push|--full])");

/** Resolve how a stage runs at this tier+scope: its concrete argv, or a mode sentinel. */
export function planStage(
  stage: StageDef,
  selection: Selection | undefined,
  tier?: Tier,
  root?: string,
): {
  readonly mode: StageMode;
  readonly argv: readonly [string, ...string[]] | null;
  readonly runsAt: string | null;
} {
  if (selection === undefined) {
    // CONDITIONAL TIER MEMBERSHIP (#1523). A whole-tier run has no Selection, so a stage that belongs to
    // this tier only under a condition asks its own precondition here. `null` (cannot tell) RUNS: an
    // expensive stage skipped on an unanswerable question is a false clean wearing a tier's clothes.
    const precondition = stage.tierPrecondition;
    if (precondition !== undefined && tier !== undefined && precondition.tiers.includes(tier) && precondition.satisfied(root ?? process.cwd()) === false) {
      return { mode: "skipped", argv: null, runsAt: unconditionalTier(stage) };
    }
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

/** Where a precondition-skipped stage DOES run unconditionally — the notice must name a tier that will
 *  actually run it, never the one that just declined. */
function unconditionalTier(stage: StageDef): string {
  const conditional = new Set(stage.tierPrecondition?.tiers ?? []);
  for (const t of ["static", "push", "full"] as const) {
    if (stage.tiers.includes(t) && !conditional.has(t)) {
      return `verify --${t}`;
    }
  }
  return "verify --full";
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

/** The artifact this harness publishes at `reports/verify.json`. */
const REPORT_NAME = "verify.json";
/** The run-slot family this harness writes under (`reports/runs/verify/<runId>/`, #1029). */
const INSTRUMENT = "verify";
/** Where per-stage transcripts live inside a run's slot; published as the `reports/verify/` alias. */
const STAGES_SEGMENT = "stages";

/** The repo-relative log path recorded in the artifact — inside THIS RUN'S slot, so two concurrent runs
 *  can never write the same stage's transcript (the defect #1029 closes; before it, `lint:biome`'s log was
 *  one path shared by every verify process on the checkout). */
function logPathFor(slot: RunSlot, stageName: string): string {
  return join(slot.relDir, STAGES_SEGMENT, `${stageName.replace(/:/gu, "-")}.log`);
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

/** The opt-in marker a stage prints to have a line SEEN on a green run (contract/stage.ts `notices`). */
const NOTICE_MARKER = "[verify-notice]";

/** Lift every `[verify-notice] …` line out of a stage's transcript. A green stage's output otherwise
 *  reaches nobody — it lands in reports/verify/<stage>.log and the console shows one ✓ line. */
export function noticesIn(output: string): string[] {
  const out: string[] = [];
  for (const line of output.split("\n")) {
    const at = line.indexOf(NOTICE_MARKER);
    if (at !== -1) {
      out.push(line.slice(at + NOTICE_MARKER.length).trim());
    }
  }
  return out;
}

/** The marker an OUTPUT AUDIT (#1245) writes into the stage's own transcript, so the per-stage log and the
 *  `failureExcerpt` cut from it both carry the reason — a refusal that lived only in the summary would be
 *  invisible to a bot reading `reports/verify/<stage>.log`. */
const AUDIT_MARKER = "[verify-audit";

/** Ask the stage's output audit, but only where a transcript can still change the verdict: a stage the
 *  classifier already called a TOOL ERROR (or misuse) has no measurement to audit, and its own diagnosis is
 *  the one the reader needs. */
export function auditOf(stage: StageDef, classified: 0 | 1 | 2 | 3, transcript: string, root: string): TranscriptAudit | null {
  if (classified !== EXIT.clean && classified !== EXIT.violations) {
    return null;
  }
  return stage.auditTranscript?.(transcript, root) ?? null;
}

/** THE AUDIT'S AUTHORITY, in one place: a refusal makes the stage a TOOL ERROR whatever the child's exit
 *  said — "the run is not a verdict" outranks both a green and a violation (a violation would send the
 *  reader hunting for a lint finding that does not exist). A notice never moves the verdict. */
export function auditedExit(classified: 0 | 1 | 2 | 3, audit: TranscriptAudit | null): 0 | 1 | 2 | 3 {
  return audit?.kind === "refusal" ? EXIT.toolError : classified;
}

/** The audit's line as it lands at the END of the stage transcript (or "" when there was nothing to say). */
export function auditLine(audit: TranscriptAudit | null): string {
  return audit === null ? "" : `\n${AUDIT_MARKER} ${audit.kind}] ${audit.message}\n`;
}

/** What one stage needs that is the same for every stage in the run: where the tree is, which run slot its
 *  transcript belongs to, and whether output is mirrored live. */
interface RunContext {
  readonly root: string;
  readonly slot: RunSlot;
  readonly verbose: boolean;
}

/** THE RESULT A STAGE THAT DID NOT RUN PUBLISHES — one home, and EXPORTED so the notice has a producer
 *  test (#1566). It was inline, which left the notice provable only through a hand-built `StageResult`:
 *  a renderer pin that stayed green with the notice line deleted. This is the smallest honest seam — the
 *  planner decides, this shapes the row, and both are now reachable from a test.
 *
 *  THE NOTICE IS THE CONDITION, in the stage's own words. `stageLine` says THAT the precondition
 *  declined; this says WHICH one, so a reader can tell "my diff touched no instrument" from "the gate is
 *  broken" without opening the registry — and because `notices` is a `StageResult` field, the same string
 *  is in verify.json by construction. */
export function nonRunningStageResult(stage: StageDef, plan: { readonly mode: StageMode; readonly runsAt: string | null }): StageResult {
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
    notices:
      plan.mode === "skipped" && plan.runsAt !== null && stage.tierPrecondition !== undefined ? [`tier precondition: ${stage.tierPrecondition.reason}`] : [],
  };
}

/** The stage door's HANG ceiling (#1508). It is not a performance budget; it is the line past which a stage
 *  is WEDGED, chosen far above any observed run (`structure:full` measured 292s on a busy box; the push
 *  tier's suites are longer still) so the only thing it can catch is a hang. Past it the stage's process
 *  group dies and its transcript says so, which the classifier scores as a tool error rather than leaving
 *  `pnpm verify` waiting forever. It still rides `budget()` like every other wall clock in tooling
 *  (`tooling-shared-plumbing` arm J): `budget()` never SHRINKS a declared base — the ten-minute ceiling caps
 *  the load STRETCH only — so a 45-minute base comes back as 45 minutes on a quiet box and can only grow. */
const STAGE_TIMEOUT_BASE_MS = 2_700_000; // 45 minutes
const STAGE_TIMEOUT_MS = budget(STAGE_TIMEOUT_BASE_MS);

async function runOneStage(ctx: RunContext, stage: StageDef, selection: Selection | undefined, tier: Tier): Promise<StageResult> {
  const { root, slot, verbose } = ctx;
  const plan = planStage(stage, selection, tier, root);
  if (plan.mode === "deferred" || plan.mode === "skipped") {
    return nonRunningStageResult(stage, plan);
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
    timeoutMs: STAGE_TIMEOUT_MS,
    ...(verbose ? { onChunk: mirrorChunk } : {}),
  });
  const durationMs = Date.now() - start;

  const body = result.transcript;
  const logFile = logPathFor(slot, stage.name);
  // OUTPUT HONESTY (#1245): the child's exit is not always its whole verdict — biome under a config it
  // failed to parse checks ZERO files, says nothing about it, and exits 0. The audit reads the transcript
  // the run already captured, so it costs nothing for the stages whose exit IS their verdict.
  const classified = stage.classify(result.code);
  const audit = auditOf(stage, classified, body, root);
  const transcript = `${body}${auditLine(audit)}`;
  writeFileAtomic(runFile(slot, STAGES_SEGMENT, `${stage.name.replace(/:/gu, "-")}.log`), `${header}${transcript}`);

  const exitCode = auditedExit(classified, audit);
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
    notices: [],
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
    failureExcerpt: ok ? null : failureExcerpt(transcript),
    runsAt: null,
    notices: [...noticesIn(body), ...(audit?.kind === "notice" ? [audit.message] : [])],
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

/** This run's artifact, written INSIDE its slot and published as `reports/verify.json` only after the run
 *  finishes — so a concurrent reader resolves to a complete run, never a half-written one (#1029). */
function writeReport(slot: RunSlot, report: VerifyReport): void {
  writeFileAtomic(runFile(slot, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
}

/** A concurrent verify run is NAMED on stderr, never silently tolerated — the artifact carries the same
 *  list in `run.concurrent`, so a lane reading only the json sees it too. */
function announceRacing(slot: RunSlot): void {
  if (slot.racing.length > 0) {
    process.stderr.write(`[verify] CONCURRENT verify run(s) on this checkout: ${slot.racing.join(", ")}\n`);
    process.stderr.write(`[verify] this run writes to ${slot.relDir}; reports/verify.json is published by whichever finishes last.\n`);
  }
}

/** The run's scope label for the banner + the artifact. */
function scopeLabel(parsed: Parsed): string {
  return parsed.selection === undefined ? "whole" : parsed.selection.label;
}

async function runTier(root: string, slot: RunSlot, parsed: Parsed): Promise<VerifyReport> {
  const startedAt = new Date().toISOString();
  printHeadBanner(parsed.tier, scopeLabel(parsed));

  const stages = stagesForTier(parsed.tier);
  const results: StageResult[] = [];
  for (const stage of stages) {
    const plan = planStage(stage, parsed.selection, parsed.tier, root);
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
        notices: [],
      });
      continue;
    }
    // Sequential BY DESIGN: stages share the CPU, the reports dir and the console — they run one at a
    // time in registry order, exactly as the old sync loop ran them. The await IS the ordering.
    results.push(await runOneStage({ root, slot, verbose: parsed.verbose }, stage, parsed.selection, parsed.tier));
  }

  const exitCode = aggregateExit(results.map((s) => s.exitCode));
  return {
    tier: parsed.tier,
    scope: scopeLabel(parsed),
    run: {
      runId: slot.runId,
      checkout: checkoutName(root),
      artifactDir: slot.relDir,
      startedAt,
      finishedAt: new Date().toISOString(),
      concurrent: slot.racing,
    },
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
  // The host-wide whole-run slot, held for the WHOLE run and released in the `finally` (../lib/whole-run-queue.ts).
  const queue = await enterWholeRunQueue(root, parsed);
  try {
    const slot = openRunSlot(root, INSTRUMENT);
    announceRacing(slot);
    const report = await runTier(root, slot, parsed);
    writeReport(slot, report);
    // The `latest` pointers, published together at the END: `reports/verify.json` and the `reports/verify/`
    // per-stage log directory the constitution names. Until this line both still resolve to the previous
    // COMPLETE run — which is the whole point of publishing at completion only.
    publishRunSlot(root, slot, [
      { alias: REPORT_NAME, target: REPORT_NAME },
      { alias: INSTRUMENT, target: STAGES_SEGMENT },
    ]);

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
  } finally {
    queue?.release();
  }
}
