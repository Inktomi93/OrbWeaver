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
//
// THE THIRD LEVER (#1040, 2026-09-02): a WITHHOLD, for the arms scaling cannot save. A load-scaled budget
// transfers to a wall-clock TIMEOUT and NOT to a measured PERCENTAGE — load does not stretch a rate
// linearly, it destroys it. Measured on identical code: motion-audit's mobile arm reported 47.54% dropped
// frames at loadavg ~25 on 24 cores, then 10%, then clean. There is no multiplier that turns 47.54% back
// into the truth, so a measured-rate arm on a contended box is NOT A MEASUREMENT and must say so instead
// of voting. Owner's issue text: "withhold, don't red" — never the third arm, widening the budget. The
// contention judgment itself is NOT a second number: it is `computeLoadFactor`'s own quiet/contended
// boundary, so this module holds ONE reading of the box with two consequences —
//   TIMEOUTS SCALE (`scaledBudget`) · PERCENTAGES WITHHOLD (`withholdMeasurement`).
import { execFileSync, spawnSync } from "node:child_process";
import { cpus, loadavg } from "node:os";
import process from "node:process";
import type { TaskMeta } from "vitest";

// The reporter-visible channel for a withheld arm, declared where the withhold lives. `TaskMeta` is
// vitest's own augmentation point and `meta` is the ONLY per-test field its json reporter serializes for a
// SKIPPED test — so this augmentation is not decoration, it is the whole reason a withhold is legible in
// `reports/test-report.json` at all (see `withholdMeasurement` + scripts/vitest-supervised.mjs).
declare module "vitest" {
  interface TaskMeta {
    /** The #1040 withhold reason, set by `withholdMeasurement` immediately before `ctx.skip`. */
    orbLoadWithheld?: string;
  }
}

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
function loadFactor(cap?: number): number {
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

// ── THE WITHHOLD (#1040) ────────────────────────────────────────────────────────────────────────────
// Sibling vocabulary to LOAD_KILL_MARKER, deliberately a DIFFERENT token: a kill is a run that broke, a
// withhold is a run that declined to vote. Conflating them would make "we chose not to measure" read as
// "the instrument failed", and the supervisor summary has to tell them apart.

/** The one distinctive token every withheld arm carries — in the skip reason, in the test's `meta`, and on
 *  stderr. `scripts/vitest-supervised.mjs` greps the merged report's `meta` for it. */
export const LOAD_WITHHOLD_MARKER = "ORB-LOAD-WITHHOLD";

/** The `meta` key a withheld arm stamps on its own task — the same name as the `TaskMeta` member above, as
 *  a value, so the supervisor's JS side and the TS side cannot drift apart. Measured 2026-09-02:
 *  `ctx.skip(reason)` alone yields `{status:"skipped", failureMessages:[], meta:{}}` and the reason appears
 *  NOWHERE in `reports/test-report.json` — i.e. a bare skip-with-reason IS the silent skip #1040 forbids. */
export const LOAD_WITHHOLD_META_KEY = "orbLoadWithheld";

/** The box's contention inputs, as one value so the reader is injectable (the planted control forces the
 *  loaded condition instead of spinning the box). */
export interface BoxLoad {
  readonly loadavg1: number;
  readonly cpuCount: number;
}

export interface MeasurementWithholding {
  readonly withheld: boolean;
  /** Populated in BOTH directions — the quiet arm's reason is the receipt that the box WAS read. */
  readonly reason: string;
}

/** The live box. Exported so a caller can pass an explicit reading; the pin injects a fake instead. */
export function readBoxLoad(): BoxLoad {
  return { loadavg1: loadavg()[0] ?? 0, cpuCount: cpus().length };
}

/** PURE. Is this box quiet enough for a measured RATE to be about the code? The threshold is not a new
 *  constant: a measurement is withheld exactly when `computeLoadFactor` leaves 1, i.e. when per-core
 *  1-minute loadavg reaches 1.0 — the same boundary that starts stretching wall-clock budgets. Derivation
 *  (#1040): the 47.54% false red was taken at loadavg ~25 on 24 cores = per-core 1.04, the first hair above
 *  that boundary, and the same code read 10% and then clean as the box quieted. Below the boundary the
 *  factor is exactly 1 and solo behaviour is untouched, so a quiet box still MEASURES — the withhold can
 *  never become a way to stop testing. */
export function judgeMeasurementLoad(box: BoxLoad, what: string): MeasurementWithholding {
  const factor = computeLoadFactor(box.loadavg1, box.cpuCount);
  const where = `loadavg ${box.loadavg1.toFixed(1)} / ${box.cpuCount} cores`;
  if (factor === 1) {
    return { withheld: false, reason: `${what}: box quiet enough to measure (${where})` };
  }
  return {
    withheld: true,
    reason:
      `${LOAD_WITHHOLD_MARKER}: box too loaded to measure (${where}) — WITHHELD, not passed and not failed. ` +
      `${what} is a measured rate, and load does not scale a rate: the same code has read 47.54%, 10% and ` +
      "clean across contention levels (#1040), so this run is NOT a verdict. Re-run on a quiet tree.",
  };
}

/** The minimum of vitest's test context this module needs — structural on purpose, so the seam does not
 *  pin itself to a whole `TestContext` (which a planted control could not construct). The real context
 *  satisfies it: `task` is `Readonly<Test>` whose `meta` is the augmented `TaskMeta`, and `skip`'s
 *  `(note?: string): never` overload is assignable to the one-arg signature below. */
export interface WithholdableTest {
  readonly task: { readonly meta: TaskMeta };
  readonly skip: (note?: string) => unknown;
}

/** Withhold a MEASURED-RATE arm when the box is too loaded for the number to mean anything. On a loaded
 *  box this stamps the reason into `task.meta` (the reporter-visible channel), shouts it on stderr, and
 *  calls `skip(reason)` — which THROWS, so nothing after the call runs and the arm never votes. On a quiet
 *  box it returns and the caller measures exactly as before.
 *
 *  CALL IT AS `withholdMeasurement({ task, skip }, "…")`, destructuring both members out of the test's own
 *  argument list. It cannot take the whole context: every suite here runs on a `test.extend` fixture, and
 *  vitest's fixture parser REFUSES a non-destructured first parameter outright — it throws
 *  `FixtureParseError: The 1st argument inside a fixture must use object destructuring pattern` — which
 *  FAILS the test rather than skipping it, i.e. exactly the false red this seam exists to prevent. `task`
 *  and `skip` are ordinary context members, so naming them alongside the fixtures is free, and `skip` is
 *  an arrow closed over the task (vitest's own runner chunk) so it survives destructuring. */
export function withholdMeasurement(ctx: WithholdableTest, what: string, read: () => BoxLoad = readBoxLoad): void {
  const verdict = judgeMeasurementLoad(read(), what);
  if (!verdict.withheld) {
    return;
  }
  ctx.task.meta[LOAD_WITHHOLD_META_KEY] = verdict.reason;
  process.stderr.write(`${verdict.reason}\n`);
  ctx.skip(verdict.reason);
}

/** Build the self-identifying error. Its message leads with the marker and spells out the classification in
 *  full so a batch reader needs no archaeology: this is a TOOL/LOAD kill, exit-2 class, not a verdict. */
function loadKillError(what: string, budgetMs: number): Error {
  const la = loadavg()[0] ?? 0;
  return new Error(
    `${LOAD_KILL_MARKER}: ${what} exceeded its load-scaled budget (${budgetMs}ms) at loadavg ${la.toFixed(1)} ` +
      `on ${cpus().length} cores — this is a TOOL/LOAD kill (exit-2 class: the run is NOT a verdict, NOT an ` +
      "assertion failure). Re-run on a quiet tree; do not read this as a real red (issue #606).",
  );
}

/** The shape node reports a killed child in — either half may be absent depending on which path fired. */
export interface KillShape {
  readonly code?: string | undefined;
  readonly signal?: string | null | undefined;
}

/** TRUE iff this is a child killed by its own `timeout`, in EITHER of the two shapes node produces. Pure and
 *  exported so both runners share ONE discriminator and both shapes are pinned — a second spelling is how the
 *  spawnSync path came to miss a kill and return `{status:0, stdout:""}`, a silent false green (#999 f). */
export function isTimeoutKill(kill: KillShape): boolean {
  return kill.signal === "SIGTERM" || kill.code === "ETIMEDOUT";
}

export interface ChildBudgetOpts {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxBuffer?: number;
}

/** Run `node <args>` under a load-scaled child `timeout`. THREE outcomes, kept distinct on purpose:
 *  - the child finishes → its stdout is returned;
 *  - the child exits 1 (a gate verdict) → its stdout is returned so the caller can read the report;
 *  - the child exits 2/3 (tool failure/misuse) → the fatal status and stderr are thrown, never flattened;
 *  - the child is KILLED by the timeout (contention) → a `loadKillError` is THROWN, so the kill is legible.
 *  Fatal exits throw ordinary errors while timeout kills alone carry LOAD_KILL_MARKER. */
interface CommandBudget {
  readonly command: string;
  readonly args: readonly string[];
  readonly opts: ChildBudgetOpts;
  readonly budgetMs: number;
  readonly label: string;
}

function runCommandWithBudget(run: CommandBudget): string {
  const { command, args, opts, budgetMs, label } = run;
  try {
    return execFileSync(command, [...args], {
      cwd: opts.cwd,
      env: opts.env,
      encoding: "utf8",
      maxBuffer: opts.maxBuffer,
      timeout: budgetMs,
    });
  } catch (err) {
    const e = err as { code?: string; signal?: string | null; stdout?: string };
    // A timeout kill has TWO shapes and BOTH are load kills. The original ruling — `signal:"SIGTERM"` (a
    // plain non-zero exit has `signal:null`) — still holds and is kept; what changed is the INPUT. Measured
    // 2026-09-01 (#999 f): `pnpm check:structure` killed at its budget under loadavg 38/24 cores threw the
    // OTHER shape instead — `code:"ETIMEDOUT"`, `errno:-110`, `syscall:"spawnSync pnpm"`, with `signal:null`
    // and `status:0`, because node surfaces spawnSync's own `error` field rather than a signalled exit when
    // the killed child's group does not report the signal back. The SIGTERM-only discriminator therefore
    // dropped the kill into the generic branch below, which printed `child exit 0` — the opaque, unclassified
    // red this whole module exists to prevent, and it cost a lane the archaeology anyway.
    if (isTimeoutKill(e)) {
      throw loadKillError(label, budgetMs);
    }
    const status = (e as { status?: number | null }).status;
    if (status === 1 && typeof e.stdout === "string") {
      return e.stdout;
    }
    if (typeof status === "number") {
      const stderr = (e as { stderr?: string }).stderr ?? "";
      throw new Error(`${label} child exit ${status}${stderr === "" ? "" : `: ${stderr}`}`, { cause: err });
    }
    throw err;
  }
}

export function runNodeWithBudget(args: readonly string[], opts: ChildBudgetOpts, budgetMs: number, label: string): string {
  return runCommandWithBudget({ command: "node", args, opts, budgetMs, label });
}

/** Workspace entrypoint variant: preserves pnpm's heap/dependency contract while retaining exit honesty. */
export function runPnpmWithBudget(args: readonly string[], opts: ChildBudgetOpts, budgetMs: number, label: string): string {
  return runCommandWithBudget({ command: "pnpm", args, opts, budgetMs, label });
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
  // `run.error` present is what separates a killed child from one that merely exited; WHICH kill shape it
  // carries (a SIGTERM'd exit or an ETIMEDOUT error object) is `isTimeoutKill`'s call — and getting that
  // wrong HERE is worse than on the execFileSync path, because the miss returns `{status:0, stdout:""}`
  // instead of throwing: a silent false green rather than an opaque red.
  if (run.error !== undefined && isTimeoutKill({ code: (run.error as { code?: string }).code, signal: run.signal })) {
    throw loadKillError(label, budgetMs);
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
