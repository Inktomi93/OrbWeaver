// The run-history store (#411): append one JSONL line per verify-family run to
// `reports/verify-history.jsonl`, and compare the current run against the previous one AT THE SAME TIER.
//
// APPEND-ONLY, BOUNDED, AND NEVER FATAL. The file lives under the gitignored `reports/` root, so it is
// per-worktree ephemera the way every other artifact is. It is trimmed to the last `MAX_ENTRIES` on each
// append — an unbounded log would make the read cost grow forever for a comparison that only ever looks at
// the most recent same-tier line. A corrupt or unreadable line is SKIPPED, and any I/O failure is swallowed
// with a warning: a timing LEDGER must never be able to fail a verification run.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ensureReportsDir, reportsPath } from "@orb/tooling/_shared/artifacts";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { RunHistoryEntry, SlowdownAdvisory } from "../contract/history.ts";
import type { VerifyReport } from "../contract/stage.ts";

/** This run's history line (#411) — built HERE, beside the store that appends it (moved out of ops/run.ts
 *  in #1848 when that file reached the tooling line cap; a ledger's row shape belongs with its ledger).
 *  Recorded BEFORE the comparison so the file is the ledger even when the comparison has nothing to say;
 *  `runId` ties the line back to the artifact it measured. */
function historyEntry(root: string, report: VerifyReport, pid: number = process.pid): RunHistoryEntry {
  const at = new Date().toISOString();
  return {
    runId: `${String(pid)}-${at}`,
    at,
    tier: report.tier,
    scope: report.scope,
    sha: currentSha(root),
    exitCode: report.exitCode,
    totalMs: report.stages.reduce((n, s) => n + s.durationMs, 0),
    stages: report.stages.map((s) => ({ name: s.name, mode: s.mode, durationMs: s.durationMs })),
  };
}

const HISTORY_FILE = "verify-history.jsonl";
/** The retained window. Deep enough to see a regression that arrived a few runs ago, shallow enough that
 *  the read stays a few KB forever. */
const MAX_ENTRIES = 200;
/** Only a stage that TOOK REAL TIME can be meaningfully "2× slower" — a 3ms→8ms jitter is noise, and an
 *  advisory that fires on noise is one nobody reads. */
const MIN_BASELINE_MS = 1000;
const SLOWDOWN_RATIO = 2;
/** Modes whose durations are comparable at all. A deferred/skipped stage records 0ms by construction. */
const RAN_MODES: ReadonlySet<string> = new Set(["full", "scoped"]);

/** The commit under judgement, or `"unknown"` — never fabricated, so a line can always be trusted about
 *  which tree it measured. */
export function currentSha(root: string): string {
  const res = runNicedSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
  return res.status === 0 && res.stdout.trim().length > 0 ? res.stdout.trim() : "unknown";
}

/** Every retained entry, oldest first. A malformed line is skipped rather than throwing — this store is
 *  evidence, and a torn append from a killed run must not blind the next comparison. */
export function readHistory(root: string): readonly RunHistoryEntry[] {
  const path = reportsPath(root, HISTORY_FILE);
  if (!existsSync(path)) {
    return [];
  }
  const out: RunHistoryEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    // @orb-waive caught-failure-ownership(catch): documented non-critical telemetry — a torn/partial line is skipped, never failing the run whose actual verdict lives elsewhere, per the doc comment above. Ends if history entries start being load-bearing for a verdict.
    try {
      out.push(JSON.parse(line) as RunHistoryEntry);
    } catch {
      // a torn/partial line — skip it, never fail the run that is only trying to record a timing
    }
  }
  return out;
}

/** Append `entry`, trimming the file to the retained window. Never throws. */
export function appendHistory(root: string, entry: RunHistoryEntry): void {
  // @orb-waive caught-failure-ownership(err): printed via warn() — documented non-critical telemetry per the doc comment above (Never throws); a lost timing record never fails the run itself. Ends if a caller starts treating history writes as load-bearing.
  try {
    ensureReportsDir(root);
    const path = reportsPath(root, HISTORY_FILE);
    const prior = readHistory(root);
    if (prior.length + 1 > MAX_ENTRIES) {
      const kept = [...prior.slice(prior.length + 1 - MAX_ENTRIES), entry];
      writeFileSync(path, `${kept.map((e) => JSON.stringify(e)).join("\n")}\n`);
      return;
    }
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    warn(`verify-history: could not record this run's timings (${err instanceof Error ? err.message : String(err)})`);
  }
}

/** The most recent retained entry at the same TIER (tiers run wildly different stage sets, so comparing
 *  across them is meaningless), excluding the run being recorded. */
export function previousAtTier(history: readonly RunHistoryEntry[], tier: string, runId: string): RunHistoryEntry | undefined {
  return [...history].reverse().find((e) => e.tier === tier && e.runId !== runId);
}

/** Stages that took materially longer than the previous same-tier run. PURE — the whole comparison is
 *  unit-testable without touching disk. Only stages that RAN in both runs are compared. */
export function slowdowns(previous: RunHistoryEntry | undefined, current: RunHistoryEntry): readonly SlowdownAdvisory[] {
  if (previous === undefined) {
    return [];
  }
  const before = new Map(previous.stages.filter((s) => RAN_MODES.has(s.mode)).map((s) => [s.name, s.durationMs]));
  const out: SlowdownAdvisory[] = [];
  for (const stage of current.stages) {
    const wasMs = before.get(stage.name);
    if (wasMs === undefined || !RAN_MODES.has(stage.mode) || wasMs < MIN_BASELINE_MS) {
      continue;
    }
    const ratio = stage.durationMs / wasMs;
    if (ratio > SLOWDOWN_RATIO) {
      out.push({ stage: stage.name, wasMs, nowMs: stage.durationMs, ratio });
    }
  }
  return out;
}

/** The advisory block — printed, never exited on. It names BOTH runs so the reader can go compare the two
 *  per-stage logs rather than take the ratio on faith. */
export function slowdownLines(previous: RunHistoryEntry | undefined, advisories: readonly SlowdownAdvisory[]): readonly string[] {
  if (advisories.length === 0 || previous === undefined) {
    return [];
  }
  return [
    `[verify] SLOWER THAN THE LAST ${previous.tier} RUN (${previous.sha} @ ${previous.at}) — advisory only, not a verdict:`,
    ...advisories.map((a) => `[verify]   · ${a.stage}: ${a.wasMs}ms → ${a.nowMs}ms (${a.ratio.toFixed(1)}×)`),
    "[verify] history → reports/verify-history.jsonl (tooling/src/verify/contract/history.ts, #411)",
  ];
}

// ── #1983 PART 2: THE INSTRUMENT BATTERY'S CADENCE, MADE VISIBLE ──────────────────────────────────────
//
// THE DEFECT. A `tests/tooling/**` suite can sit RED on main for DAYS with no signal, and it happened FOUR
// times in one five-day window: `registry-family.suite.test.ts` (5 days), `gate-ignore-grammar.repo.int.test.ts`
// (5 days), `gate-conformance.repo.int.test.ts` and `gate-spelling-twins.int.test.ts`. The mechanism is not
// a bad test — every one of them fired LOUD the moment its premise moved. It is that `tests/tooling/**` is
// `--full`-only (#1842, owner's word, unchanged) and NOTHING RUNS `--full` ON A CADENCE, so the observation
// channel was the break, not the instrument.
//
// PART 2 WAS RULED, NOT INVENTED HERE (claude-b, 2026-09-12): the battery runs ONCE PER MERGE TRAIN at the
// quiescent barrier — not on `push`, not nightly — capping unobserved red at one train. That ruling is
// recorded in the orchestrator playbook's owed-at-barrier list, and until now it lived ONLY there. A law
// that lives only in prose is a wish (constitution §2.3): nothing on the machine could say how long it had
// actually been, which is the same blindness one layer up.
//
// SO THE CADENCE BECOMES A READING, NOT AN ENFORCEMENT. The ruling assigns the barrier runner, while this
// module has no merge-train identity, schedule or pass/fail history from which it could enforce that duty.
// `reports/verify-history.jsonl` already records every verify-family run
// with its sha and its per-stage modes, so "when did the battery last RUN on this checkout" is answerable
// from a store that already exists — no new artifact, no clock, no schedule. Every WHOLE-TREE run prints it.
//
// WHAT THE LINE CLAIMS, EXACTLY — and it is narrower than "the battery is green". History records a stage's
// MODE and DURATION, never its exit, so this says LAST RAN and never "last passed"; and the window is the
// retained MAX_ENTRIES of a gitignored per-checkout file, so "not within the retained window" is the honest
// phrasing for an absent answer rather than "never". Both limits are in the rendered text, not just here:
// a cadence advisory that overstated itself would be the false clean this row is about.

/** The stage whose cadence this advisory reports — the `--full`-only instrument battery (#1842). */
const BATTERY_STAGE = "tests:tooling";

/** The most recent retained run in which `stage` actually RAN (a deferred/skipped row records 0ms and is
 *  not a run of it). Exported for the unit arm — the whole comparison is pure. */
export function lastRanAt(history: readonly RunHistoryEntry[], stage: string): RunHistoryEntry | undefined {
  return [...history].reverse().find((entry) => entry.stages.some((s) => s.name === stage && RAN_MODES.has(s.mode)));
}

/** The cadence advisory for the instrument battery, as rendered lines. EMPTY on a scoped run: `--changed`
 *  defers half the tier by design and a cadence claim there would be about the wrong question. */
export function batteryCadenceLines(history: readonly RunHistoryEntry[], report: VerifyReport): readonly string[] {
  if (report.scope !== "whole") {
    return [];
  }
  const ran = report.stages.some((s) => s.name === BATTERY_STAGE && RAN_MODES.has(s.mode));
  if (ran) {
    return [`[verify] ${BATTERY_STAGE}: RAN in this run — the merge train's instrument battery is covered by this verdict (#1983).`];
  }
  const last = lastRanAt(history, BATTERY_STAGE);
  const since =
    last === undefined
      ? "NOT WITHIN THE RETAINED HISTORY WINDOW on this checkout"
      : `last RAN at ${last.sha} (${last.at}, tier ${last.tier}) — ${String(history.length - history.indexOf(last) - 1)} verify run(s) ago`;
  return [
    `[verify] ${BATTERY_STAGE} did NOT run here (it is --full-only, #1842): ${since}.`,
    "[verify]   A tests/tooling/** red is invisible until it does — four sat unobserved for five days (#1983). It is OWED ONCE PER MERGE TRAIN at the quiescent barrier.",
    "[verify]   This line reports when the battery last RAN, never that it passed — history records a stage's mode, not its exit.",
    "[verify]   Cadence enforcement remains the quiescent-barrier procedure; this bounded per-checkout history cannot identify a merge train or prove a prior pass.",
  ];
}

/** THE HISTORY LEG OF A RUN, in one door: record this run, then return every advisory line the summary
 *  prints above its tail block. It lives here rather than in `ops/run.ts` for the reason the row shape does
 *  — the ledger owns reading and writing itself — and it keeps the runner's body at one call. */
export function historyAdvisories(root: string, report: VerifyReport): readonly string[] {
  const entry = historyEntry(root, report);
  const history = readHistory(root);
  const previous = previousAtTier(history, report.tier, entry.runId);
  appendHistory(root, entry);
  return [...batteryCadenceLines(history, report), ...slowdownLines(previous, slowdowns(previous, entry))];
}
