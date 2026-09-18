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
//   RATE — dropped-frame %, CLS deltas, LoAF/INP, any A/B delta: MEASURED at any load and LABELLED
//     `load-suspect` above the SAME boundary (`judgeMeasurementLoad`). Load does not scale a rate, it
//     destroys it: measured on identical code, motion-audit's mobile arm read 47.54% dropped frames at
//     per-core 1.04, then 10%, then clean (#1040) — so the number above the boundary is NOT a verdict and
//     can never be promoted. What changed on 2026-09-05 (OWNER RULING, #1616) is what we do about it:
//     "LABEL, DON'T WITHHOLD". The old arm DECLINED TO VOTE, and since our steady state is lanes + engines
//     (per-core ≥ 1.0 means loadavg ≥ 24 on this 16c/24t box) that made every rate arm unavailable most of
//     the day — the owner, on a snap withheld at loadavg 26-31: "that's dumb." So the arm now RUNS, reports
//     its number, and stamps `load-suspect` on it; the number is readable, and every promotion path stays
//     shut (§7.1). Still never widened, never red.
//   IDLE — session/stage TTLs: NOT a budget. Idle is not load; a TTL is never scaled and never withheld.
//
// THE THRESHOLD IS NOT A SECOND CONSTANT. Both consequences key off `computeLoadFactor`'s own quiet/
// contended boundary (per-core 1-minute loadavg ≥ 1.0, factor 1 → >1). A quiet box therefore leaves every
// budget BYTE-IDENTICAL to its base and every rate arm reporting `complete` — and above the boundary the
// arm still MEASURES, so the label can never become a way to stop measuring (planted control T15,
// tests/tooling/_shared/load-budget.test.ts).
//
// AND THE QUIET-BOX INVARIANT IS WHY THE SCALING IS SAFE, NOT MERELY GENEROUS — read this before
// suspecting the module of hiding failures. A budget that grows under load could obviously mask a genuine
// slowdown; what prevents it is that the growth is EXACTLY ZERO whenever the box is quiet. A real
// regression is still measured against the author's declared base on the run that matters, and the only
// runs that get headroom are the ones whose wall clock was never a statement about the code. The factor is
// therefore a statement about the BOX, and the one way to break that guarantee is to make the denominator
// dishonest — which is what #1985 found and fixed (`load-budget-cgroup.ts#cgroupQuotaCores`).
//
// PURE except for `readBoxLoad` (the one `os.loadavg()` read) and `budgetCeilingMs` (the one env read); the
// cgroup fence `readBoxLoad` folds in (quota ceiling + throttle sample) is read by `load-budget-cgroup.ts`.
// Every judging function takes the reading as a value, so a planted control forces the loaded condition
// instead of spinning the box.
import { loadavg } from "node:os";
import process from "node:process";
import type { CpuThrottleSample } from "./load-budget-cgroup.ts";
import { effectiveCpuCount, liveThrottle } from "./load-budget-cgroup.ts";

/** The one distinctive token every load-kill error carries. A lane greps for it to classify exit-2. */
export const LOAD_KILL_MARKER = "ORB-LOAD-KILL";

/** Sibling vocabulary to LOAD_KILL_MARKER, deliberately a DIFFERENT token: a kill is a run that BROKE, a
 *  load-suspect number is one that WAS measured and cannot be promoted. Conflating them would make "this
 *  reading is about the box" read as "the instrument failed", and every summary has to tell them apart.
 *
 *  RENAMED 2026-09-05 from `LOAD_WITHHOLD_MARKER`/`ORB-LOAD-WITHHOLD` (#1616): under the owner ruling the
 *  arm no longer withholds, so a marker that says WITHHOLD would be the lie this module exists to prevent.
 *  Every spelling moved in the same commit — the old token appears nowhere on the tree. */
export const LOAD_SUSPECT_MARKER = "ORB-LOAD-SUSPECT";

/** The vitest `task.meta` key a load-suspect arm stamps on its own task (the reporter-visible channel — a
 *  bare stderr line puts the reason NOWHERE in reports/test-report.json). Held as a VALUE so the
 *  supervisor's JS side and the TS side cannot drift apart. */
export const LOAD_SUSPECT_META_KEY = "orbLoadSuspect";

/** The Playwright annotation TYPE a load-suspect CT stamps — `test.info().annotations` is the
 *  reporter-visible channel, the CT twin of `task.meta`. Counted by
 *  tooling/src/verify/ops/ct-flaky-reporter.ts. */
export const LOAD_SUSPECT_ANNOTATION = "orb-load-suspect";

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
  /** The cgroup throttling record for this process tree, or `undefined` on an UNFENCED box (no cgroup v2,
   *  `cpu.max` = `max`, `ORB_DEDICATED_BOX=1`) and for every PLANTED reading — a planted box states a
   *  loadavg and nothing else, so plants keep the exact behaviour they had before this field existed. */
  readonly throttle?: CpuThrottleSample | undefined;
  /** PROVENANCE, carried by the VALUE (#1666): `true` only for a reading `readBoxLoad` took from
   *  {@link BOX_LOAD_ENV}. The receipt printers stamp `(planted)` on exactly this, so the stamp certifies
   *  the number it is printed beside rather than the process it was printed in. Absent ⇒ the live box, or
   *  a control the caller injected and therefore owns. */
  //  `| undefined` because a CARRIER of this reading (snap's rate posture) declares the field through a
  //  zod schema, whose `.optional()` output is `boolean | undefined`; under `exactOptionalPropertyTypes`
  //  a bare `?:` would refuse that value at the seam (TS2379).
  readonly planted?: boolean | undefined;
}

/** How a caller supplies the reading. The default is the live box; a planted control passes a fake. */
export type BoxLoadReader = () => BoxLoad;

/** The live box — the ONE `os.loadavg()` read in the fleet. */
/** THE PLANTED-READING ENV SEAM (#1651). Every judging function here takes the reading as a VALUE, which
 *  serves an in-process control perfectly — and serves a CLI int test not at all, because the instrument
 *  under test is a CHILD PROCESS. Without this seam those suites assert against whatever the box happened
 *  to be doing: `run-bundle.suite.int.test.ts`'s "no findings" pin passed on a quiet box and went red at
 *  loadavg 34 with a perfectly correct `load-suspect` annotation (v-K8's receipt).
 *
 *  Spelled `<loadavg1>/<cpuCount>`, e.g. `0.2/24` (quiet) or `96/24` (per-core 4.0). */
export const BOX_LOAD_ENV = "ORB_BOX_LOAD";

/** A planted reading is ANNOUNCED, never silent: `loadPairs`/`loadResultPairs` stamp `planted` into the
 *  `load=` value, so a receipt taken under a fake box says so on its own RESULT line. A quiet-looking run
 *  that was quiet only because someone exported the knob is exactly the lie this module exists to stop. */
const PLANTED_SUFFIX = "(planted)";

function rawBoxLoadKnob(): string | undefined {
  // biome-ignore lint/style/noProcessEnv: this IS the tooling env door for a planted control — the rule guards app config reads, and no config is read here.
  const raw = process.env[BOX_LOAD_ENV];
  return raw === undefined || raw.trim() === "" ? undefined : raw;
}

/** PURE + TOTAL: the operator message for a mis-spelled knob, or `null` when the knob is absent or valid.
 *
 *  IT IS A VALUE, NOT A THROW, because of WHERE the first read happens (#1666): several instruments derive
 *  a module-scope budget, so a throw from the reader fires during the IMPORT GRAPH — before `runTool`
 *  installs its handlers — and node's default crash exit is 1, which under the house contract means
 *  "violations found". A mis-spelled dev knob is the MISUSE class, so `_shared/run-tool.ts` asks this
 *  question once per CLI, inside `main`'s try, and raises the one-line `UsageError` (exit 3, no stack). */
export function boxLoadKnobError(): string | null {
  const raw = rawBoxLoadKnob();
  if (raw === undefined) {
    return null;
  }
  const [load, cores] = raw.split("/");
  const loadavg1 = Number(load);
  const cpuCount = Number(cores);
  const wellFormed = Number.isFinite(loadavg1) && loadavg1 >= 0 && Number.isInteger(cpuCount) && cpuCount >= 1;
  return wellFormed ? null : `${BOX_LOAD_ENV}="${raw}" is not a planted box reading — spell it "<loadavg1>/<cpuCount>", e.g. "0.2/24"`;
}

function plantedBoxLoad(): BoxLoad | undefined {
  const raw = rawBoxLoadKnob();
  if (raw === undefined) {
    return;
  }
  if (boxLoadKnobError() !== null) {
    // NO THROW HERE, and that is a MEASURED constraint, not a softening (#1666). This reader runs inside
    // the IMPORT GRAPH — `snap/lib/budgets.ts:19` derives a module-scope ceiling — so a throw fires before
    // `runTool` installs its handlers and node's crash exit is 1, i.e. "violations found" (receipt: the
    // red-first arm printed `expected exit 3 (misuse), got 1 (violations)` with a stack frame at
    // budgets.ts:19). The refusal therefore lives at the DOORS, where it can be one honest line:
    //   • every instrument CLI — `runTool` asks `boxLoadKnobError()` before `main` and exits 3;
    //   • every vitest worker — `tests/tooling/_load-budget.ts` asks at import and throws, which the
    //     runner reports as a failure naming the knob.
    // A reader with neither door (a config load) falls back to the LIVE box, and the missing `(planted)`
    // stamp on its receipts is what tells the operator their plant never took.
    return;
  }
  const [load, cores] = raw.split("/");
  // PROVENANCE TRAVELS WITH THE READING (#1666). The stamp used to key off "is the env set", which
  // certified numbers it had never seen: under `ORB_BOX_LOAD=0.2/24`, `loadPairs(() => ({loadavg1: 7.5,
  // cpuCount: 8}))` printed `load=7.5/8(planted)` — 7.5/8 was never planted. A flag ON THE VALUE is the
  // only thing that can answer "did THIS number come from the plant", and it survives every carrier that
  // spreads the reading (snap's rate posture does, and its contract now names the field).
  return { loadavg1: Number(load), cpuCount: Number(cores), planted: true };
}

export function readBoxLoad(): BoxLoad {
  const throttle = liveThrottle();
  return plantedBoxLoad() ?? { loadavg1: loadavg()[0] ?? 0, cpuCount: effectiveCpuCount(), ...(throttle === undefined ? {} : { throttle }) };
}

/** PURE: a wall-clock multiplier ≥1 derived from the 1-minute loadavg vs the core count. A quiet box
 *  (per-core load below 1.0) returns EXACTLY 1 — solo budgets unchanged, the hard constraint. */
export function computeLoadFactor(loadavg1: number, cpuCount: number, cap = FACTOR_CAP): number {
  if (cpuCount <= 0 || !Number.isFinite(loadavg1) || loadavg1 <= 0) {
    return 1;
  }
  return Math.min(cap, Math.max(1, loadavg1 / cpuCount));
}

/** PURE: the wall-clock stretch implied by QUOTA THROTTLING, which is the contention `computeLoadFactor`
 *  structurally cannot see (#2206).
 *
 *  THE HOLE IT CLOSES. `computeLoadFactor` is `max(1, loadavg/cores)`, so it returns EXACTLY 1 for the whole
 *  band `0 < loadavg < cores` — a fenced session at 99% utilisation gets no uplift at all. That band is not
 *  a quiet box: `.claude/hooks/cpu-fence.sh` enforces `CPUQuota` through cgroup v2's 100ms period, and a
 *  tree that wants more CPU than its slice IS STOPPED for the rest of each period it exceeds. Measured on
 *  this session's own scope while writing this (2026-09-12): `cpu.max` = `800000 100000` (8 cores),
 *  `nr_periods` 1,282,742, `nr_throttled` 158,691 — 12.4% of periods ended in a throttle, while loadavg sat
 *  well under 8 and the factor read a flat 1. The row that found it (#2206) is the barrier's planter dying
 *  at a 300s budget on a pass that costs 257s solo: a ≥1.17× stretch the loadavg model priced at 1.00.
 *
 *  THE CURVE HAS NO FREE CONSTANT, which is why it can be landed without a calibration drive: if a fraction
 *  `r` of periods is spent stopped, the same work takes `1/(1-r)` as long. At the measured r = 0.124 that is
 *  1.14× — the right order for the ≥1.17× slip above, from an independent signal. It is ONE corroborating
 *  point, not a calibration: the shape is a queueing identity rather than a fitted curve, and a drive that
 *  samples a known-cost pass at several throttle rates would confirm or refute it.
 *
 *  It only ever RAISES a budget (`budget` takes the max of the two factors) and is `undefined` on an
 *  unfenced or planted box, so a solo-box budget and every planted control keep their exact former value. */
export function throttleFactor(sample: CpuThrottleSample | undefined, cap = FACTOR_CAP): number {
  if (sample === undefined || sample.periods <= 0 || sample.throttled <= 0) {
    return 1;
  }
  const rate = Math.min(sample.throttled / sample.periods, 1);
  return rate >= 1 ? cap : Math.min(cap, Math.max(1, 1 / (1 - rate)));
}

/** The ONE contention factor for a WALL CLOCK: the worse of what loadavg says about the machine and what
 *  `cpu.stat` says about the fence. Deliberately NOT used by `judgeMeasurementLoad` — see the note there. */
export function boxFactor(box: BoxLoad, cap = FACTOR_CAP): number {
  return Math.max(computeLoadFactor(box.loadavg1, box.cpuCount, cap), throttleFactor(box.throttle, cap));
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
  const scaled = Math.ceil(baseMs * boxFactor(box, cap));
  return Math.max(baseMs, Math.min(budgetCeilingMs(), scaled));
}

/** The two RESULT pairs every load-aware line carries: `load=<la1>/<cores>` and `budget-factor=<f>`. A
 *  reader can tell a stretched run from a quiet one without the argv. */
export function loadPairs(read: BoxLoadReader = readBoxLoad): readonly string[] {
  const box = read();
  return [`load=${loadValue(box)}`, `budget-factor=${boxFactor(box).toFixed(2)}`];
}

/** The `load=` VALUE every receipt site shares — one home, so the planted stamp cannot land on one line
 *  and not the next. `(planted)` iff THIS READING came from {@link BOX_LOAD_ENV} (`box.planted`), never
 *  merely because the env is set: an explicitly-injected reader is the CALLER's own value and is printed
 *  unstamped. Exported so the two PROSE sites below print the same stamped figure the pairs do. */
export function loadValue(box: BoxLoad): string {
  return `${box.loadavg1.toFixed(1)}/${String(box.cpuCount)}${box.planted === true ? PLANTED_SUFFIX : ""}`;
}

/** The same two pairs as one space-joined line — the RESULT-line / diagnostic spelling. */
export function loadLine(read: BoxLoadReader = readBoxLoad): string {
  return loadPairs(read).join(" ");
}

/** `loadPairs`, reshaped as key/value tuples so a `printVerdict` `pairs` array can spread them directly
 *  (`_shared/artifacts.ts` `ResultPair` — not imported here to keep this module's only cross-file
 *  dependency the box reader; the tuple shape is structurally identical). §7.1: "printVerdict prints the
 *  two load pairs on every RESULT line by default (a reader can tell a stretched run from a quiet one
 *  without the argv)". */
export function loadResultPairs(read: BoxLoadReader = readBoxLoad): readonly (readonly [string, string])[] {
  const box = read();
  return [
    ["load", loadValue(box)],
    ["budget-factor", boxFactor(box).toFixed(2)],
  ];
}

/** THE ONE RATE-VERDICT VOCABULARY (#1616). Three members, closed, and every consumer dispatches on the
 *  member rather than on a boolean — which is what makes a new member a COMPILE error at every call site:
 *
 *  · `complete`     — the box was quiet; the number is a verdict and may be judged against a threshold.
 *  · `load-suspect` — the box was loaded; the number WAS MEASURED and is reported, but it is a reading
 *                     about the box as much as the code, so nothing may promote it: no threshold verdict,
 *                     no exit contribution, no problem row (§7.1).
 *  · `withheld`     — no number exists at all. This member survives the ruling because one cause still
 *                     produces nothing to label: an unproven / software-rendered browser, where the
 *                     "rate" would describe a software rasteriser (snap/lib/rate-posture.ts). LOAD never
 *                     lands here any more. */
export const MEASUREMENT_DISPOSITIONS = ["complete", "load-suspect", "withheld"] as const;
export type MeasurementDisposition = (typeof MEASUREMENT_DISPOSITIONS)[number];

export interface MeasurementVerdict {
  readonly disposition: MeasurementDisposition;
  /** Populated in EVERY direction — the quiet arm's reason is the receipt that the box WAS read. */
  readonly reason: string;
}

/** May this number be judged (a threshold, an exit, a problem row)? ONLY `complete`. The other two are
 *  deliberately collapsed here: a `load-suspect` number exists and a `withheld` one does not, but neither
 *  may be promoted, and a caller that has to remember which is which will eventually forget. */
export function isJudgeableMeasurement(verdict: MeasurementVerdict): boolean {
  return verdict.disposition === "complete";
}

/** Did a number come back at all? `complete` and `load-suspect` both measured; `withheld` did not. */
export function hasMeasurement(verdict: MeasurementVerdict): boolean {
  return verdict.disposition !== "withheld";
}

/** PURE. Is this box quiet enough for a measured RATE to be a verdict about the code? The threshold is not
 *  a new constant: a measurement is `load-suspect` exactly when `computeLoadFactor` leaves 1 — the same
 *  boundary that starts stretching wall clocks. Below it the factor is exactly 1 and solo behaviour is
 *  untouched. IT NEVER RETURNS `withheld`: under the #1616 ruling load labels, it does not withhold. */
//  #2206, DELIBERATE NON-CHANGE: this judge stays on LOADAVG ALONE and does not take `throttleFactor`.
//  The throttle counters are CUMULATIVE over a session scope that lives for hours, so they are a PRIOR
//  about how fenced this session is — fine for stretching a wall clock (which may only ever grow), and
//  wrong for a rate arm, which needs a statement about the box DURING the measurement. Folding it in here
//  would mark essentially every rate arm in every fenced lane `load-suspect` forever, which is the
//  withhold-everything failure the #1616 ruling already reversed once.
export function judgeMeasurementLoad(box: BoxLoad, what: string): MeasurementVerdict {
  // The SAME stamped figure the RESULT pairs carry (#1666): a `load-suspect` reason taken under a planted
  // box used to read exactly like a live-box sentence, and this string is what a reader sees FIRST.
  const where = `loadavg ${loadValue(box)} cores`;
  if (computeLoadFactor(box.loadavg1, box.cpuCount) === 1) {
    return { disposition: "complete", reason: `${what}: box quiet enough to measure (${where})` };
  }
  return {
    disposition: "load-suspect",
    reason:
      `${LOAD_SUSPECT_MARKER}: box loaded while measuring (${where}) — the number below was MEASURED and is ` +
      `reported, but it is LOAD-SUSPECT: not passed, not failed, and never promotable. ${what} is a measured ` +
      "rate, and load does not scale a rate: the same code has read 47.54%, 10% and clean across contention " +
      "levels (#1040). Read the number; re-run on a quiet tree before treating it as a verdict.",
  };
}

/** The RATE-arm door for a caller that has no vitest task and no Playwright testInfo (an instrument's own
 *  verdict path): judge the live box and hand back the verdict. The CALLER owns the consequence — and
 *  since #1616 the load consequence is a LABEL: the arm measures, prints its number, and marks that arm
 *  `<arm>=load-suspect`. The exit stays whatever the other members decide. */
export function judgeRateLoad(what: string, read: BoxLoadReader = readBoxLoad): MeasurementVerdict {
  return judgeMeasurementLoad(read(), what);
}

/** The push-able annotation list a Playwright test carries — structural on purpose so this module never
 *  imports `@playwright/test` (it is read by node CLIs and by vite/vitest configs too). `TestInfo` and
 *  `TestResult` both satisfy it. */
export interface AnnotatableTest {
  readonly annotations: { type: string; description?: string }[];
}

/** The CT twin of `labelRateLoad`: judge the box for a RATE-measuring component test and, on a loaded box,
 *  stamp `orb-load-suspect` where the REPORTER can see it (`test.info().annotations` is the CT's only
 *  per-test reporter-visible channel — the twin of vitest's `task.meta`). It never skipped and it still
 *  does not; since #1616 the CALLER must not skip either — it measures, annotates, and does not assert its
 *  threshold. Counted by tooling/src/verify/ops/ct-flaky-reporter.ts beside the flake tally, so a
 *  load-suspect CT is never a silent green. */
export function annotateRateLoad(info: AnnotatableTest, what: string, read: BoxLoadReader = readBoxLoad): MeasurementVerdict {
  const verdict = judgeMeasurementLoad(read(), what);
  if (verdict.disposition === "load-suspect") {
    info.annotations.push({ type: LOAD_SUSPECT_ANNOTATION, description: verdict.reason });
  }
  return verdict;
}

/** The RESULT-pair spelling for a rate arm: `<arm>=complete|load-suspect|withheld` — the member itself, so
 *  the terminal transcript carries the same closed vocabulary the facts do. */
export function ratePair(arm: string, verdict: MeasurementVerdict): string {
  return `${arm}=${verdict.disposition}`;
}

/** The RESULT-line pair naming WHICH arms came back load-suspect, printed beside `load=`/`budget-factor=`
 *  so one line answers "was anything measured under load, and how loaded was it?" (#1616 done-criterion 1).
 *  Absent when nothing was suspect — a reader must never have to distinguish "none" from "not reported". */
export function loadSuspectPair(arms: readonly string[]): readonly (readonly [string, string])[] {
  return arms.length === 0 ? [] : [["load-suspect", [...arms].sort().join(",")]];
}

/** The summary DERIVED from the pairs an instrument already printed, never accumulated a second time — a
 *  second accumulator is how a summary and its own arms come to disagree. Any pair whose VALUE is the
 *  `load-suspect` member names its arm, whatever case the arm printed it in (`motion=LOAD-SUSPECT`,
 *  `app-snapshot=load-suspect`). */
export function loadSuspectSummary(pairs: readonly (readonly [string, string | number])[]): readonly (readonly [string, string])[] {
  return loadSuspectPair(pairs.filter(([, value]) => String(value).toLowerCase() === "load-suspect").map(([arm]) => arm));
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
    `at loadavg ${loadValue(box)} cores — this is a TOOL/LOAD kill (exit-2 class: the run is NOT a ` +
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
