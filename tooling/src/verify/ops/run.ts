// `pnpm verify` — the ONE verification entry (UNIFIED-VERIFICATION-DESIGN.md §3). Four tiers, one scope
// convention, one exit contract, one summary/artifact, generalized over the self-describing stage registry.
//
//   pnpm verify              → --static  (today's `pnpm check`, byte-compatible)
//   pnpm verify --changed    → the inner loop (scoped, related tests)
//   pnpm verify --static     → the whole static tier (= `pnpm check`); pre-commit adds `--changed`
//   pnpm verify --push       → static + node tests + CT + e2e-smoke (the pre-push bar)
//   pnpm verify --full       → push + cpd + full e2e + mutation-gate
//   pnpm verify --list       → print every registry row (incl. manual) with its tiers/reason
//   pnpm verify --json       → mirror reports/verify.json to stdout
//   pnpm verify --file <p…>  → scoped to explicit paths (the check:file muscle memory)
//   pnpm verify --package <n> / --scope <glob> / --tier <name>  → package / folder / explicit-tier scope
//   pnpm verify --strict-scope  → a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring
//   pnpm verify --verbose    → stream each stage's full output live (default: COMPACT — one START line plus
//                              a per-stage ✓/✗ line; full output goes to logs + json, so the console survives
//                              any head/tail truncation. Verbose is EXPLICIT-only: TTY auto-detection is gone —
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
import { inheritedRunMarker, mintRunMarker, runLeaseEnv, runMarkerEnv, runMarkerTranscriptTeardown } from "@orb/tooling/_shared/run-marker";
import type { Selection } from "../contract/selection.ts";
import type { StageDef, StageMode, StageResult, Tier, TranscriptAudit, VerifyReport } from "../contract/stage.ts";
import { NOTICE_MARKER, VERIFY_INSTRUMENT, VERIFY_REPORT_NAME } from "../contract/stage.ts";
import { colourNeutralParentEnv } from "../lib/child-env.ts";
import { aggregateExit, noVerdictStages } from "../lib/exit-classifiers.ts";
import { historyAdvisories } from "../lib/history.ts";
import { stagesForTier } from "../lib/registry.ts";
import type { Parsed } from "../lib/run-argv.ts";
import { printHeadBanner, printList, printSummary, stageLine } from "../lib/run-render.ts";
import { stageHangCeilingBaseMs } from "../lib/stage-budget.ts";
import { refuseUnrunnableRows, resolveStageCommand, unresolvableCommandTranscript } from "../lib/stage-command.ts";
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

const EXCERPT_LINES = 8; // failure excerpt: the last N non-blank output lines (where tools print the verdict).

/** The tail of a failed stage's output — the last few non-blank lines, where tsc/biome/vitest/playwright
 *  print their error summary. Lands in reports/verify.json + the tail console block so a bot never has to
 *  open the per-stage log to learn WHY a stage failed. */
function failureExcerpt(output: string): string {
  const lines = output.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  return lines.slice(-EXCERPT_LINES).join("\n");
}

/** Lift every `[verify-notice] …` line out of a stage's transcript. A green stage's output otherwise
 *  reaches nobody — it lands in reports/verify/<stage>.log and the console shows one ✓ line. */
export function noticesIn(output: string): string[] {
  const out: string[] = [];
  for (const line of output.split(/\r?\n/u)) {
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
  /** This run's process marker (#1848) — in every stage child's env so a browser that left the process group
   *  still dies with the run that started it. INHERITED inside a marked run, which is why it is NOT what the
   *  kill paths sweep (#2504): that is `runLease`, MINTED here, stamped beside it, one per RUN not per stage
   *  (stages are sequential, so a timeout's reach is unchanged). */
  readonly runMarker: string;
  readonly runLease: string;
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

/** The stage door's HANG ceiling (#1508) — the line past which a stage is WEDGED, never a performance
 *  budget. The BASE is data now (`../lib/stage-budget.ts`, #1848: one typed 45 minutes for every stage
 *  turned a quiet-box CT run into a false `[tool-error]`); the load STRETCH is applied here, because
 *  `budget()` never shrinks a base — a 45-minute base is 45 minutes on a quiet box and can only grow
 *  (`tooling-clock-budget`). */
function stageTimeoutMs(stage: StageDef): number {
  return budget(stageHangCeilingBaseMs(stage));
}

async function runOneStage(ctx: RunContext, stage: StageDef, selection: Selection | undefined, tier: Tier): Promise<StageResult> {
  const { root, slot, verbose } = ctx;
  const plan = planStage(stage, selection, tier, root);
  if (plan.mode === "deferred" || plan.mode === "skipped") {
    return nonRunningStageResult(stage, plan);
  }
  const argv = plan.argv as readonly [string, ...string[]];
  const header = `\n=== ${stage.name} (${argv.join(" ")})${plan.mode === "scoped" ? " [scoped]" : ""} ===\n`;
  // Compact mode (default): name the active stage, then keep its full output in the per-stage log + json.
  // The log only materializes after completion, so the START line names the work without promising live
  // log bytes. Verbose (--verbose): stream the header + output live instead.
  if (verbose) {
    process.stdout.write(header);
  } else {
    process.stdout.write(`[verify] START ${stage.name}${plan.mode === "scoped" ? " [scoped]" : ""}\n`);
  }

  const start = Date.now();
  const [cmd, ...args] = argv;
  // NO_COLOR only, and an inherited FORCE_COLOR dropped — `lib/child-env.ts` owns that decision and the
  // incident behind it (#2469). BOTH IDENTITIES ride the same env (#1848, #2504): every descendant of this
  // stage carries them, so the kill paths reach what left the process group — see `RunContext.runLease`.
  const identity = { ...runMarkerEnv(ctx.runMarker), ...runLeaseEnv(ctx.runLease) };
  const env = { ...colourNeutralParentEnv(), ...Object.fromEntries([["NO_COLOR", "1"]]), ...identity, ...stage.env };
  // ARGV[0] IS RESOLVED FROM EVIDENCE, AND AN UNRESOLVABLE ONE IS REFUSED WITHOUT SPAWNING (#2220/#2225):
  // the old name allowlist sent `bash` to `node_modules/.bin/bash` and made `lint:hook-syntax` an exit-2
  // every static run since it landed. A refusal settles as `code: null`, which every classifier maps to a
  // TOOL ERROR (2) — the run is not a verdict — never to a violation (1) wearing the same costume. The PATH
  // handed to the resolver is the COMPOSED one the child will actually get (`stage.env` may override it),
  // never the parent's — otherwise it would answer about a search path the child never sees.
  const resolved = resolveStageCommand(root, cmd, env["PATH"] ?? "");
  const result =
    resolved.kind === "unresolvable"
      ? { code: null, transcript: unresolvableCommandTranscript(stage.name, resolved) }
      : await spawnNicedTranscript(resolved.command, args, {
          cwd: root,
          env,
          timeoutMs: stageTimeoutMs(stage),
          teardown: runMarkerTranscriptTeardown(ctx.runLease),
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
    childExit: result.code, // #2225 — the RAW digit, kept; `contract/stage.ts` states why it must survive `classify`.
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
  writeFileAtomic(runFile(slot, VERIFY_REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
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
  // ONE marker for the whole run, INHERITED when this verify is itself running inside a marked run: a
  // second marker would orphan every browser from the outer run's sweep, which is the hole being closed.
  // AND ONE LEASE, ALWAYS MINTED (#2504): the marker above may name a run that merely CONTAINS this one.
  const runMarker = inheritedRunMarker() ?? mintRunMarker();
  const runLease = mintRunMarker();
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
    results.push(await runOneStage({ root, slot, verbose: parsed.verbose, runMarker, runLease }, stage, parsed.selection, parsed.tier));
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
    noVerdict: noVerdictStages(results),
    stages: results,
  };
}

/** The `verify` verb: run a tier, write reports/verify.json, retain the run's timings, print the
 *  truncation-robust summary, and return the run's exit code (the cli's runTool owns the process exit —
 *  never a bare process.exit here, which would drop the unflushed summary). */
export async function runVerify(root: string, parsed: Parsed): Promise<number> {
  if (parsed.list) {
    printList();
    return refuseUnrunnableRows(root);
  }
  // The host-wide whole-run slot, held for the WHOLE run and released in the `finally` (../lib/whole-run-queue.ts).
  const queue = await enterWholeRunQueue(root, { tier: parsed.tier, scoped: parsed.selection !== undefined });
  try {
    const slot = openRunSlot(root, VERIFY_INSTRUMENT);
    announceRacing(slot);
    const report = await runTier(root, slot, parsed);
    writeReport(slot, report);
    // The `latest` pointers, published together at the END: `reports/verify.json` and the `reports/verify/`
    // per-stage log directory the constitution names. Until this line both still resolve to the previous
    // COMPLETE run — which is the whole point of publishing at completion only.
    publishRunSlot(root, slot, [
      { alias: VERIFY_REPORT_NAME, target: VERIFY_REPORT_NAME },
      { alias: VERIFY_INSTRUMENT, target: STAGES_SEGMENT },
    ]);

    // #411 (slowdowns) + #1983 (the --full battery's cadence): retain this run, then print what the history
    // has to say. BEFORE the summary block, so the truncation-robust tail stays last. `../lib/history.ts`.
    for (const line of historyAdvisories(root, report)) {
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
