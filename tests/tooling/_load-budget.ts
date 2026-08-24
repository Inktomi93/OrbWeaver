// Load-honest wall-clock budgets for the heavy tooling self-tests (NOT a test file — no `.test` suffix,
// so test-layout ignores it, the `_support.ts` precedent). The problem this fixes (issue #606): three
// suites blow FIXED wall-clock budgets under multi-lane load and fail as generic SUITE ERRORS — a hook
// timeout / test timeout that reads IDENTICALLY to a real assertion red in a batch report, so a lane must
// do archaeology to learn its "red" was really a load kill (exit-2 class, NOT a verdict). Two levers, both
// here: (1) budgets SCALE with the box's contention so the common case never false-reds; (2) when a CHILD
// PROCESS is the slow thing, its timeout throws a SELF-IDENTIFYING error carrying LOAD_KILL_MARKER, so the
// kill is legible without archaeology. The pure `computeLoadFactor` is unit-pinned; the child runner is
// exercised with a planted slow case (tests/tooling/load-budget.int.test.ts). Owner instrument-honesty law
// (2026-08-22): a load-blown run must be KNOWABLY not-a-verdict, never a silent or misread red.
import { execFileSync, spawnSync } from "node:child_process";
import { cpus, loadavg } from "node:os";

/** The one distinctive token every load-kill error carries. A lane greps for it to classify exit-2. */
export const LOAD_KILL_MARKER = "ORB-LOAD-KILL";

/** Pure: a wall-clock multiplier ≥1 derived from the 1-minute loadavg vs the core count. A quiet box
 *  (per-core load below 1.0) returns EXACTLY 1 — solo budgets are unchanged, the brief's hard constraint.
 *  A saturated box scales the budget by the per-core contention so a fixed base is not a false red. Capped
 *  so a runaway loadavg can't inflate a budget to hours (a genuinely wedged run should still eventually
 *  surface, just legibly via the child-timeout path, not by hanging the whole battery). */
export function computeLoadFactor(loadavg1: number, cpuCount: number, cap = 8): number {
  if (cpuCount <= 0 || !Number.isFinite(loadavg1) || loadavg1 <= 0) {
    return 1;
  }
  const perCore = loadavg1 / cpuCount;
  return Math.min(cap, Math.max(1, perCore));
}

/** The live factor, reading the real box. */
export function loadFactor(cap?: number): number {
  return computeLoadFactor(loadavg()[0] ?? 0, cpus().length, cap);
}

/** A budget that GROWS with contention. `baseMs` is the measured-solo runtime plus headroom; the return is
 *  what to hand a vitest timeout or a child-process `timeout`. */
export function scaledBudget(baseMs: number, cap?: number): number {
  return Math.ceil(baseMs * loadFactor(cap));
}

/** True iff `err` is one of this module's self-identifying load kills — the classifier a lane (or the pin)
 *  uses to tell an exit-2 load kill apart from a real assertion red. */
export function isLoadKill(err: unknown): boolean {
  return err instanceof Error && err.message.includes(LOAD_KILL_MARKER);
}

/** Build the self-identifying error. Its message leads with the marker and spells out the classification in
 *  full so a batch reader needs no archaeology: this is a TOOL/LOAD kill, exit-2 class, not a verdict. */
export function loadKillError(what: string, budgetMs: number): Error {
  const la = loadavg()[0] ?? 0;
  return new Error(
    `${LOAD_KILL_MARKER}: ${what} exceeded its load-scaled budget (${budgetMs}ms) at loadavg ${la.toFixed(1)} ` +
      `on ${cpus().length} cores — this is a TOOL/LOAD kill (exit-2 class: the run is NOT a verdict, NOT an ` +
      "assertion failure). Re-run on a quiet tree; do not read this as a real red (issue #606).",
  );
}

export interface ChildBudgetOpts {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxBuffer?: number;
}

/** Run `node <args>` under a load-scaled child `timeout`. THREE outcomes, kept distinct on purpose:
 *  - the child finishes → its stdout is returned;
 *  - the child exits non-zero WITHOUT being killed (e.g. report.ts exits 1 when a gate fires) → its stdout
 *    is still returned, exactly as a bare `execFileSync` catch would surface it (the caller reads the report);
 *  - the child is KILLED by the timeout (contention) → a `loadKillError` is THROWN, so the kill is legible.
 *  The timeout kill is the ONLY throwing path, so a real violation never masquerades as a load kill. */
export function runNodeWithBudget(args: readonly string[], opts: ChildBudgetOpts, budgetMs: number, label: string): string {
  try {
    return execFileSync("node", [...args], {
      cwd: opts.cwd,
      env: opts.env,
      encoding: "utf8",
      maxBuffer: opts.maxBuffer,
      timeout: budgetMs,
    });
  } catch (err) {
    const e = err as { signal?: string | null; stdout?: string };
    // execFileSync's timeout kill throws an error carrying `signal:"SIGTERM"` (a plain non-zero exit has
    // `signal:null`). That — and only that — is the load kill. (Unlike spawnSync's RESULT object, the
    // execFileSync ERROR has no `killed` boolean, so the signal is the reliable discriminator.)
    if (e.signal === "SIGTERM") {
      throw loadKillError(label, budgetMs);
    }
    if (typeof e.stdout === "string") {
      return e.stdout;
    }
    throw err;
  }
}

export interface SpawnBudgetResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** `spawnSync("node", …)` under a load-scaled child `timeout`, THROWING a legible `loadKillError` when the
 *  child is killed by that timeout rather than returning a `status:null` result the caller would misread as
 *  a failed assertion. A normal exit (any status) is returned untouched. */
export function spawnNodeWithBudget(args: readonly string[], cwd: string, budgetMs: number, label: string): SpawnBudgetResult {
  const run = spawnSync("node", [...args], { cwd, encoding: "utf8", timeout: budgetMs });
  if (run.signal === "SIGTERM" && run.error !== undefined) {
    throw loadKillError(label, budgetMs);
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
