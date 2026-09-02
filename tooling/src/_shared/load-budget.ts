// THE ONE READING OF THE BOX (docs/design/1208-instrument-substrate.md §7.1, owner addition 2026-09-02).
// A wall-clock budget written for a quiet box reads as a RED on a contended one, and a measured RATE taken
// on a contended box is a number about the box, not the code. Both wear the clothes of a real verdict.
// Before this module the fleet carried FOUR unrelated answers to that class (a test-only helper, five
// instrument budget tables, two runner configs and a shell launcher); this is the ONE, and the pure core
// lives HERE — at the plumbing floor — precisely so an INSTRUMENT, a CONFIG and a LAUNCHER can read it,
// which `tests/tooling/_load-budget.ts` (its previous home, test-only) structurally could not serve.
//
// THREE CLASSES, THREE CONSEQUENCES, ONE THRESHOLD:
//   WALL CLOCK — nav/readiness/step ceilings, child timeouts, vitest + CT test timeouts, boot ceilings:
//     `budget(baseMs)` stretches them by the per-core contention, capped at FACTOR_CAP and at an ABSOLUTE
//     ceiling (`ORB_BUDGET_CEILING_MS`, default 10 min — fork F11) so a genuinely WEDGED subject still
//     surfaces inside one lane's patience. A budget that fires is an honest exit-2 ("could not measure")
//     carrying LOAD_KILL_MARKER, never a violation.
//   RATE — dropped-frame %, CLS deltas, LoAF/INP, any A/B delta: WITHHELD at the SAME boundary before the
//     arm votes (`judgeMeasurementLoad`). Load does not scale a rate, it destroys it: measured on identical
//     code, motion-audit's mobile arm read 47.54% dropped frames at per-core 1.04, then 10%, then clean
//     (#1040). There is no multiplier that turns 47.54% back into the truth — so the arm declines to vote.
//     Never widened, never red ("withhold, don't red").
//   IDLE — session/stage TTLs: NOT a budget. Idle is not load; a TTL is never scaled and never withheld.
//
// THE THRESHOLD IS NOT A SECOND CONSTANT. Both consequences key off `computeLoadFactor`'s own quiet/
// contended boundary (per-core 1-minute loadavg ≥ 1.0, factor 1 → >1). A quiet box therefore leaves every
// budget BYTE-IDENTICAL to its base and every rate arm MEASURING — the withhold can never become a way to
// stop testing (planted control T15, tests/tooling/_shared/load-budget.test.ts).
//
// PURE except for `readBoxLoad` (the one `os.loadavg()` read) and `budgetCeilingMs` (the one env read).
// Every judging function takes the reading as a value, so a planted control forces the loaded condition
// instead of spinning the box.
import { cpus, loadavg } from "node:os";
import process from "node:process";

/** The one distinctive token every load-kill error carries. A lane greps for it to classify exit-2. */
export const LOAD_KILL_MARKER = "ORB-LOAD-KILL";

/** Sibling vocabulary to LOAD_KILL_MARKER, deliberately a DIFFERENT token: a kill is a run that BROKE, a
 *  withhold is a run that DECLINED TO VOTE. Conflating them would make "we chose not to measure" read as
 *  "the instrument failed", and every summary has to tell them apart. */
export const LOAD_WITHHOLD_MARKER = "ORB-LOAD-WITHHOLD";

/** The vitest `task.meta` key a withheld arm stamps on its own task (the reporter-visible channel — a bare
 *  `ctx.skip(reason)` puts the reason NOWHERE in reports/test-report.json). Held as a VALUE so the
 *  supervisor's JS side and the TS side cannot drift apart. */
export const LOAD_WITHHOLD_META_KEY = "orbLoadWithheld";

/** The Playwright annotation TYPE a withheld CT stamps — `test.info().annotations` is the reporter-visible
 *  channel, the CT twin of `task.meta`. Counted by tooling/src/verify/ops/ct-flaky-reporter.ts. */
export const LOAD_WITHHOLD_ANNOTATION = "orb-load-withheld";

/** The factor ceiling. A runaway loadavg must not inflate a 30s budget into hours — a wedged run should
 *  surface legibly through the kill path, not by hanging the battery. */
export const FACTOR_CAP = 8;

/** The ABSOLUTE ceiling on any scaled budget (fork F11, ruled 2026-09-02): 10 minutes. Even at FACTOR_CAP
 *  a wedged subject must surface as exit 2 inside one lane's patience. */
export const DEFAULT_BUDGET_CEILING_MS = 600_000;

/** The env override for the absolute ceiling — a calibration drive on a dedicated box may raise it. ONE
 *  spelling: the read below uses this constant, never a second string literal. */
const BUDGET_CEILING_ENV = "ORB_BUDGET_CEILING_MS";

/** The box's contention inputs, as ONE value so the reader is injectable. */
export interface BoxLoad {
  readonly loadavg1: number;
  readonly cpuCount: number;
}

/** How a caller supplies the reading. The default is the live box; a planted control passes a fake. */
export type BoxLoadReader = () => BoxLoad;

/** The live box — the ONE `os.loadavg()` read in the fleet. */
export function readBoxLoad(): BoxLoad {
  return { loadavg1: loadavg()[0] ?? 0, cpuCount: cpus().length };
}

/** PURE: a wall-clock multiplier ≥1 derived from the 1-minute loadavg vs the core count. A quiet box
 *  (per-core load below 1.0) returns EXACTLY 1 — solo budgets unchanged, the hard constraint. */
export function computeLoadFactor(loadavg1: number, cpuCount: number, cap = FACTOR_CAP): number {
  if (cpuCount <= 0 || !Number.isFinite(loadavg1) || loadavg1 <= 0) {
    return 1;
  }
  return Math.min(cap, Math.max(1, loadavg1 / cpuCount));
}

/** The env override, read ONCE at module load — the `_shared/browser.ts` DEFAULT_BASE precedent, and
 *  correct for the way this knob is used: every consumer is a fresh process (an instrument CLI, a vitest
 *  worker, a config load, a spawned child), so a caller that wants a different ceiling sets it in the
 *  ENVIRONMENT OF THE CHILD, never mid-process. */
// biome-ignore lint/style/noProcessEnv: ORB_BUDGET_CEILING_MS is an ambient TOOLING knob (the calibration-drive override on the absolute budget ceiling), the same class as this directory's SNAP_BASE_URL/DEBUG_TOKEN rows — not app config, and the env door the rule points at (packages/server/src/foundation/env) sits ABOVE @orb/tooling in the cake, so it cannot be imported down here.
const CEILING_OVERRIDE_MS = Number(process.env[BUDGET_CEILING_ENV]);

/** The absolute ceiling in force for this process. A non-numeric or non-positive override falls back to
 *  the default rather than silently disabling the ceiling. */
export function budgetCeilingMs(): number {
  return Number.isFinite(CEILING_OVERRIDE_MS) && CEILING_OVERRIDE_MS > 0 ? CEILING_OVERRIDE_MS : DEFAULT_BUDGET_CEILING_MS;
}

/** THE WALL-CLOCK DOOR. `baseMs` is the measured-quiet runtime plus headroom; the return is what to hand a
 *  Playwright `timeout`, a child-process `timeout`, a vitest `testTimeout` or a boot poll.
 *
 *  A base ALREADY above the ceiling is returned untouched — the ceiling caps the STRETCH, it never shrinks
 *  a budget its author deliberately declared (silently halving a declared 15-minute base would turn this
 *  honesty mechanism into the false-red generator it exists to end). */
export function budget(baseMs: number, read: BoxLoadReader = readBoxLoad, cap = FACTOR_CAP): number {
  const box = read();
  const scaled = Math.ceil(baseMs * computeLoadFactor(box.loadavg1, box.cpuCount, cap));
  return Math.max(baseMs, Math.min(budgetCeilingMs(), scaled));
}

/** The two RESULT pairs every load-aware line carries: `load=<la1>/<cores>` and `budget-factor=<f>`. A
 *  reader can tell a stretched run from a quiet one without the argv. */
export function loadPairs(read: BoxLoadReader = readBoxLoad): readonly string[] {
  const box = read();
  return [`load=${box.loadavg1.toFixed(1)}/${String(box.cpuCount)}`, `budget-factor=${computeLoadFactor(box.loadavg1, box.cpuCount).toFixed(2)}`];
}

/** The same two pairs as one space-joined line — the RESULT-line / diagnostic spelling. */
export function loadLine(read: BoxLoadReader = readBoxLoad): string {
  return loadPairs(read).join(" ");
}

export interface MeasurementWithholding {
  readonly withheld: boolean;
  /** Populated in BOTH directions — the quiet arm's reason is the receipt that the box WAS read. */
  readonly reason: string;
}

/** PURE. Is this box quiet enough for a measured RATE to be about the code? The threshold is not a new
 *  constant: a measurement is withheld exactly when `computeLoadFactor` leaves 1 — the same boundary that
 *  starts stretching wall clocks. Below it the factor is exactly 1 and solo behaviour is untouched, so a
 *  quiet box still MEASURES. */
export function judgeMeasurementLoad(box: BoxLoad, what: string): MeasurementWithholding {
  const where = `loadavg ${box.loadavg1.toFixed(1)} / ${String(box.cpuCount)} cores`;
  if (computeLoadFactor(box.loadavg1, box.cpuCount) === 1) {
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

/** The RATE-arm door for a caller that has no vitest task and no Playwright testInfo (an instrument's own
 *  verdict path): judge the live box and hand back the verdict. The CALLER owns the consequence — an
 *  instrument whose ONLY output is the rate exits 2; one with other verdict members marks that arm
 *  `<arm>=withheld` and keeps the rest. */
export function withholdRate(what: string, read: BoxLoadReader = readBoxLoad): MeasurementWithholding {
  return judgeMeasurementLoad(read(), what);
}

/** The push-able annotation list a Playwright test carries — structural on purpose so this module never
 *  imports `@playwright/test` (it is read by node CLIs and by vite/vitest configs too). `TestInfo` and
 *  `TestResult` both satisfy it. */
export interface AnnotatableTest {
  readonly annotations: { type: string; description?: string }[];
}

/** The CT twin of `withholdMeasurement`: judge the box for a RATE-measuring component test and, when the
 *  box is too loaded, stamp `orb-load-withheld` where the REPORTER can see it (`test.info().annotations`
 *  is the CT's only per-test reporter-visible channel — the twin of vitest's `task.meta`). It does NOT
 *  skip: skipping is `test.skip(verdict.withheld, verdict.reason)` at the call site, because Playwright's
 *  skip is a static on `test`, not a member of `TestInfo`. Counted by
 *  tooling/src/verify/ops/ct-flaky-reporter.ts beside the flake tally, so a withheld CT is never a silent
 *  green skip. */
export function annotateRateWithhold(info: AnnotatableTest, what: string, read: BoxLoadReader = readBoxLoad): MeasurementWithholding {
  const verdict = judgeMeasurementLoad(read(), what);
  if (verdict.withheld) {
    info.annotations.push({ type: LOAD_WITHHOLD_ANNOTATION, description: verdict.reason });
  }
  return verdict;
}

/** The RESULT-pair spelling for a withheld arm: `<arm>=withheld`. */
export function withheldPair(arm: string): string {
  return `${arm}=withheld`;
}

/** What was killed and against which numbers. `baseMs` is optional because two callers exist: one that
 *  DERIVED the budget here and still holds the base (an instrument, a boot poll — it names the arithmetic),
 *  and one handed only the final ceiling by its own caller (the test-seam child runners, whose signature
 *  predates this module). The message states exactly what it knows and never invents the other half — a
 *  base back-derived from a CAPPED budget would be arithmetic fiction printed as a receipt. */
export interface LoadKill {
  readonly what: string;
  /** The ceiling that actually fired. */
  readonly budgetMs: number;
  /** The un-scaled base it was derived from, when the caller knows it. */
  readonly baseMs?: number;
}

/** The self-identifying kill message. It leads with the marker and spells the classification out in full so
 *  a batch reader needs no archaeology: a TOOL/LOAD kill, exit-2 class, NOT a verdict — and it NAMES THE
 *  ARITHMETIC (`<ms> = <base>×<factor>`) plus the loadavg, so the reader can see whether the budget was
 *  stretched at all before it fired. */
export function loadKillMessage(kill: LoadKill, read: BoxLoadReader = readBoxLoad): string {
  const box = read();
  const factor = computeLoadFactor(box.loadavg1, box.cpuCount);
  const arithmetic = kill.baseMs === undefined ? "" : ` = ${String(kill.baseMs)}×${factor.toFixed(2)}`;
  return (
    `${LOAD_KILL_MARKER}: ${kill.what} exceeded its load-scaled budget (${String(kill.budgetMs)}ms${arithmetic}) ` +
    `at loadavg ${box.loadavg1.toFixed(1)}/${String(box.cpuCount)} cores — this is a TOOL/LOAD kill (exit-2 class: the run is NOT a ` +
    "verdict, NOT an assertion failure). Re-run on a quiet tree; do not read this as a real red (#606)."
  );
}

/** Build the self-identifying error the child runners throw. */
export function loadKillError(kill: LoadKill, read: BoxLoadReader = readBoxLoad): Error {
  return new Error(loadKillMessage(kill, read));
}

/** True iff `err` is one of this module's self-identifying load kills — the classifier that tells an
 *  exit-2 load kill apart from a real assertion red. */
export function isLoadKill(err: unknown): boolean {
  return err instanceof Error && err.message.includes(LOAD_KILL_MARKER);
}

/** The shape node reports a killed child in — either half may be absent depending on which path fired. */
export interface KillShape {
  readonly code?: string | undefined;
  readonly signal?: string | null | undefined;
}

/** TRUE iff this is a child killed by its own `timeout`, in EITHER of the two shapes node produces. ONE
 *  discriminator for both runners: a second spelling is how the spawnSync path came to miss a kill and
 *  return `{status:0, stdout:""}` — a silent false green (#999 f). */
export function isTimeoutKill(kill: KillShape): boolean {
  return kill.signal === "SIGTERM" || kill.code === "ETIMEDOUT";
}
