// THE PLANTED CONTROLS for the one load policy (T14/T15/T16).
// Every arm here injects its reading of the box instead of spinning the machine, because the whole
// point of the policy is that the box reading is a VALUE the judging functions take — a control that had to
// load the box could never run in the battery, and one that did would be measuring the battery.
//
// What each proves, and why the pair is the proof:
//   T14 a FORCED-LOAD reading LABELS a rate arm `load-suspect`, naming the loadavg — and it still
//       MEASURES (#1616, owner ruling 2026-09-05: "label, don't withhold"). Never a red, never a skip;
//   T15 a QUIET reading leaves factor 1, every budget BYTE-IDENTICAL to its base and the arm `complete`.
//       This is the positive control that the LABEL cannot become a way to stop MEASURING (#1040/#1616)
//       and that scaling cannot become a way to stop failing — without it T14 is satisfied by a stub that
//       always labels;
//   T16 a genuinely HUNG subject under the SAME forced load still dies at its scaled ceiling, with a
//       message naming base×factor and the loadavg. The ceiling is not a way to hang.
import { cpus } from "node:os";
import {
  annotateRateLoad,
  BOX_LOAD_ENV,
  boxFactor,
  boxLoadKnobError,
  budget,
  computeLoadFactor,
  FACTOR_CAP,
  hasMeasurement,
  isJudgeableMeasurement,
  isLoadKill,
  isTimeoutKill,
  judgeMeasurementLoad,
  judgeRateLoad,
  LOAD_KILL_MARKER,
  LOAD_SUSPECT_MARKER,
  loadKillError,
  loadKillMessage,
  loadLine,
  loadPairs,
  loadResultPairs,
  loadSuspectPair,
  loadSuspectSummary,
  ratePair,
  readBoxLoad,
} from "@orb/tooling/_shared/load-budget";
import { cgroupQuotaCores, effectiveCpuCount, readCpuThrottle } from "@orb/tooling/_shared/load-budget-cgroup";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

/** Per-core 4.0 on a 24-core box — the FORCED-LOAD reading T14/T16 use. */
const LOADED = { loadavg1: 96, cpuCount: 24 } as const;
/** Per-core 0.3 — quiet, and quiet is EXACTLY factor 1 (the boundary is 1.0, not "some load"). */
const QUIET = { loadavg1: 7.2, cpuCount: 24 } as const;

const readLoaded = (): typeof LOADED => LOADED;
const readQuiet = (): typeof QUIET => QUIET;

// ── T14: a forced-load reading LABELS a rate arm — and it still MEASURES ────────────────────────────
test("T14 — a rate arm on a forced-load reading is LOAD-SUSPECT with the loadavg receipt, never a red", () => {
  const verdict = judgeRateLoad("motion-audit's dropped-frame rate", readLoaded);
  expect(verdict.disposition).toBe("load-suspect");
  // THE HALF THE #1616 RULING ADDED: the arm MEASURED. `hasMeasurement` is what every caller keys its
  // "print the number" branch on, and a label that answered false here would be the old withhold wearing a
  // new name.
  expect(hasMeasurement(verdict)).toBe(true);
  // …and it is UNJUDGEABLE: no threshold, no exit contribution, no problem row.
  expect(isJudgeableMeasurement(verdict)).toBe(false);
  // The receipt must NAME THE BOX: a label whose reason does not say what was loaded is indistinguishable
  // from a note somebody left behind.
  expect(verdict.reason).toContain(LOAD_SUSPECT_MARKER);
  expect(verdict.reason).toContain("96.0/24 cores");
  // …and it is emphatically NOT a kill: the two vocabularies are different tokens on purpose (a kill is a
  // run that broke, a load-suspect number is one that was taken on a loaded box), and conflating them is
  // how "this reading is about the box" would read as "the instrument failed".
  expect(verdict.reason).not.toContain(LOAD_KILL_MARKER);
  expect(isLoadKill(new Error(verdict.reason))).toBe(false);
  expect(ratePair("dropped", verdict)).toBe("dropped=load-suspect");
  expect(loadSuspectPair(["motion", "app-snapshot"])).toEqual([["load-suspect", "app-snapshot,motion"]]);
  // NOTHING suspect ⇒ NO pair at all: a reader must never have to tell "none" from "not reported".
  expect(loadSuspectPair([])).toEqual([]);
});

test("T14 — the RESULT-line summary is DERIVED from the arms' own pairs, in every case they print", () => {
  // ONE LINE ANSWERS "was anything measured under load?" (#1616 done-criterion 1) — and it is derived, not
  // accumulated a second time, because a summary with its own counter is how a run comes to disagree with
  // its own arms. The case-insensitive read is load-bearing: motion prints `motion=LOAD-SUSPECT` (its
  // status vocabulary is upper-case) while snap's perf arms print the member lower-case.
  expect(
    loadSuspectSummary([
      ["motion", "LOAD-SUSPECT"],
      ["app-snapshot", "load-suspect"],
      ["contrast", "passed"],
      ["steps", 4],
      ["perf", "withheld"],
    ]),
  ).toEqual([["load-suspect", "app-snapshot,motion"]]);
  // A withheld arm is NOT a load-suspect one — the summary must not blur the two members.
  expect(
    loadSuspectSummary([
      ["perf", "withheld"],
      ["contrast", "passed"],
    ]),
  ).toEqual([]);
});

test("T14 — the WITHHELD member survives for the one cause that yields NO number", () => {
  // #1616 retired the LOAD withhold, not the member: an unproven/software-rendered browser still produces
  // nothing to label (snap/lib/rate-posture.ts). This pins the collapse rule both ways.
  const withheld = { disposition: "withheld", reason: "SOFTWARE-ACCELERATION-WITHHOLD: …" } as const;
  expect(hasMeasurement(withheld)).toBe(false);
  expect(isJudgeableMeasurement(withheld)).toBe(false);
  expect(ratePair("perf", withheld)).toBe("perf=withheld");
  // …and load NEVER lands there any more — the arm this ruling governs cannot reach the member.
  expect(judgeRateLoad("x", readLoaded).disposition).not.toBe("withheld");
});

test("T14 — the CT channel stamps the LABEL where the REPORTER can see it, and never skips", () => {
  // The CT twin of `task.meta`: a green CT carries no output at all, so an un-annotated load-suspect run is
  // a silent green. `annotateRateLoad` is the ONLY thing that makes it legible to ct-flaky-reporter — and
  // it MUST NOT skip: the test runs, the number exists, only its threshold stands down (#1616).
  const annotations: { type: string; description?: string }[] = [];
  const info = { annotations };
  const loaded = annotateRateLoad(info, "a CT-measured rate", readLoaded);
  expect(loaded.disposition).toBe("load-suspect");
  expect(hasMeasurement(loaded)).toBe(true);
  expect(info.annotations).toHaveLength(1);
  expect(info.annotations[0]?.type).toBe("orb-load-suspect");
  expect(info.annotations[0]?.description).toContain(LOAD_SUSPECT_MARKER);
  // The quiet arm stamps NOTHING — an annotation on a clean measurement would inflate the census.
  const quiet = annotateRateLoad(info, "a CT-measured rate", readQuiet);
  expect(quiet.disposition).toBe("complete");
  expect(info.annotations).toHaveLength(1);
});

// ── T15: the positive control — a quiet box is byte-identical to no policy at all ───────────────────
test("T15 — a quiet reading leaves factor 1 and every budget BYTE-IDENTICAL to its base", () => {
  expect(computeLoadFactor(QUIET.loadavg1, QUIET.cpuCount)).toBe(1);
  // Byte-identical across the whole spread of bases the fleet actually declares — the CT expect timeout,
  // the vitest default, a nav ceiling, the CT test timeout, a boot ceiling.
  for (const base of [5000, 10_000, 15_000, 30_000, 180_000, 240_000]) {
    expect(budget(base, readQuiet)).toBe(base);
  }
  // …and the arm's number is a VERDICT. Without this half, a stub that always labels satisfies T14.
  expect(judgeMeasurementLoad(QUIET, "the dropped-frame rate").disposition).toBe("complete");
  expect(isJudgeableMeasurement(judgeMeasurementLoad(QUIET, "the dropped-frame rate"))).toBe(true);
});

test("T15 — the boundary is computeLoadFactor's own, not a second constant", () => {
  // Per-core EXACTLY 1.0 is the first contended reading: the factor leaves 1, so the LABEL fires. The
  // 47.54% false red (#1040) was taken at per-core 1.04 — the first hair above this line.
  expect(computeLoadFactor(24, 24)).toBe(1);
  expect(judgeMeasurementLoad({ loadavg1: 24, cpuCount: 24 }, "x").disposition).toBe("complete");
  expect(computeLoadFactor(24.96, 24)).toBeGreaterThan(1);
  expect(judgeMeasurementLoad({ loadavg1: 24.96, cpuCount: 24 }, "x").disposition).toBe("load-suspect");
});

test("T15 — a loaded reading STRETCHES a budget, and the stretch is capped in both directions", () => {
  expect(budget(30_000, readLoaded)).toBe(120_000); // 4x per-core contention
  // The FACTOR cap: a runaway loadavg cannot inflate a budget without limit…
  expect(budget(1000, () => ({ loadavg1: 10_000, cpuCount: 24 }))).toBe(8000);
  // …and the ABSOLUTE ceiling (fork F11, 10 min) bounds the stretch even at the factor cap, so a wedged
  // subject still surfaces inside one lane's patience.
  expect(budget(180_000, () => ({ loadavg1: 10_000, cpuCount: 24 }))).toBe(600_000);
  // A base ALREADY above the ceiling is returned untouched — the ceiling caps the STRETCH; it never
  // shrinks a budget its author deliberately declared (model-ab's 15-minute cold-load boot is the live case).
  expect(budget(900_000, readLoaded)).toBe(900_000);
});

test("T15 — the RESULT pairs report the reading a run was judged on", () => {
  expect(loadLine(readQuiet)).toBe("load=7.2/24 budget-factor=1.00");
  expect(loadLine(readLoaded)).toBe("load=96.0/24 budget-factor=4.00");
  // The live reader is exercised too, so a broken os.loadavg() read cannot hide behind injected fakes.
  const box = readBoxLoad();
  expect(box.cpuCount).toBeGreaterThan(0);
  expect(loadLine()).toMatch(/^load=\d+\.\d+\/\d+ budget-factor=\d+\.\d{2}$/u);
});

// #1283: the tuple twin of loadLine — the shape a `printVerdict` `pairs` array spreads directly (an
// instrument's RESULT line, snap's included, carries these as key/value pairs rather than a joined string).
test("T14/T15 — loadResultPairs carries the same two figures as loadLine, as key/value tuples", () => {
  expect(loadResultPairs(readQuiet)).toEqual([
    ["load", "7.2/24"],
    ["budget-factor", "1.00"],
  ]);
  expect(loadResultPairs(readLoaded)).toEqual([
    ["load", "96.0/24"],
    ["budget-factor", "4.00"],
  ]);
  // Same live-reader exercise as loadLine: the default reader path is not left to the injected fakes alone.
  const [load, factor] = loadResultPairs();
  expect(load?.[0]).toBe("load");
  expect(factor?.[0]).toBe("budget-factor");
});

// ── #1666: the honesty stamp certifies THE NUMBER, not the process ────────────────────────────────
//
// The first cut keyed `(planted)` off "is ORB_BOX_LOAD set", so it certified readings it had never seen:
// under a planted env, an injected reader's own figure came back stamped. A stamp that can be wrong is
// worse than none — this is the mechanism a reader trusts when deciding whether a receipt describes the
// real box. Provenance now rides ON the value (`BoxLoad.planted`).
test("#1666 — an INJECTED reader is never stamped, even while the planted env is set", () => {
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
  try {
    // The verifier's exact repro: 7.5/8 was never planted, and must not claim to be.
    expect(loadPairs(() => ({ loadavg1: 7.5, cpuCount: 8 }))).toEqual(["load=7.5/8", "budget-factor=1.00"]);
    expect(loadResultPairs(() => ({ loadavg1: 7.5, cpuCount: 8 }))).toEqual([
      ["load", "7.5/8"],
      ["budget-factor", "1.00"],
    ]);
    // …and the AMBIENT reader — the one that actually took the reading from the knob — still stamps.
    expect(readBoxLoad()).toEqual({ loadavg1: 0.2, cpuCount: 24, planted: true });
    expect(loadPairs()).toEqual(["load=0.2/24(planted)", "budget-factor=1.00"]);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("#1666 — the PROSE sites carry the same stamp as the pairs: a planted reason/kill cannot read live", () => {
  // Both strings are what a reader sees FIRST — a `load-suspect` line and an exit-2 kill. Unstamped, they
  // were indistinguishable from a live-box sentence taken on a genuinely loaded machine.
  const planted = { loadavg1: 96, cpuCount: 24, planted: true } as const;
  expect(judgeMeasurementLoad(planted, "the dropped-frame rate").reason).toContain("96.0/24(planted) cores");
  expect(loadKillMessage({ what: "a wedged child", budgetMs: 1000 }, () => planted)).toContain("at loadavg 96.0/24(planted) cores");
  // The live twin is untouched — the stamp appears only where the reading was planted.
  expect(judgeMeasurementLoad({ loadavg1: 96, cpuCount: 24 }, "x").reason).toContain("96.0/24 cores");
  expect(judgeMeasurementLoad({ loadavg1: 96, cpuCount: 24 }, "x").reason).not.toContain("planted");
});

test("#1666 — a MALFORMED knob is a value the CLI door can refuse, not a module-init throw", () => {
  // The refusal must be reachable BEFORE anything reads a budget: several instruments derive a
  // module-scope ceiling, so a throw fires inside the import graph — before runTool installs its
  // handlers — and node's crash exit is 1, which under the house contract means "violations found".
  for (const spelling of ["not-a-reading", "0.2/0", "0.2", "-1/24", "0.2/2.5"]) {
    vi.stubEnv(BOX_LOAD_ENV, spelling);
    expect(boxLoadKnobError(), `${spelling} must be refused`).toContain(BOX_LOAD_ENV);
    vi.unstubAllEnvs();
  }
  // A well-formed knob and an ABSENT knob are both silent — the door only speaks to a real mis-spelling.
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
  expect(boxLoadKnobError()).toBeNull();
  vi.unstubAllEnvs();
  expect(boxLoadKnobError()).toBeNull();
});

// ── T16 (pure half): the kill is legible and is never confused with a red ──────────────────────────
// The HUNG-SUBJECT half needs a real child process, so it lives in the .int twin beside this file.
test("T16 — the kill message NAMES base×factor and the loadavg, so no reader needs archaeology", () => {
  // Without the arithmetic a reader cannot tell a STRETCHED ceiling from an unstretched one, which is
  // exactly the archaeology this vocabulary exists to end.
  const message = loadKillMessage({ what: "a wedged child", budgetMs: 1000, baseMs: 250 }, readLoaded);
  expect(message).toContain(LOAD_KILL_MARKER);
  expect(message).toContain("(1000ms = 250×4.00)");
  expect(message).toContain("at loadavg 96.0/24 cores");
  expect(isLoadKill(loadKillError({ what: "a wedged child", budgetMs: 1000, baseMs: 250 }, readLoaded))).toBe(true);
  // A caller that knows only the final ceiling (the test-seam child runners, whose signature predates the
  // policy) states what it knows and INVENTS NOTHING — a base back-derived from a capped budget would be
  // arithmetic fiction printed as a receipt.
  const partial = loadKillMessage({ what: "a wedged child", budgetMs: 1000 }, readLoaded);
  expect(partial).toContain("(1000ms)");
  expect(partial).not.toContain("×");
});

test("T16 — a kill is told from an ordinary red, in BOTH node kill shapes", () => {
  // The two shapes are not a list of two: a SIGTERM'd exit and node's own ETIMEDOUT error object are the
  // same event, and reading only the first returned `{status:0, stdout:""}` — a silent false green (#999 f).
  expect(isTimeoutKill({ signal: "SIGTERM" })).toBe(true);
  expect(isTimeoutKill({ code: "ETIMEDOUT", signal: null })).toBe(true);
  expect(isTimeoutKill({ signal: null })).toBe(false);
  expect(isTimeoutKill({ code: "ENOENT", signal: null })).toBe(false);
  expect(isLoadKill(new Error("expected [] to equal [ 'x' ]"))).toBe(false);
});

// ── #1985: the DENOMINATOR is the cores this process tree may USE, not the cores the box has ─────────
//
// THE DEFECT THIS PINS. `enforcement-registry-parity.int.test.ts` carries `scaledBudget(60_000)`, timed out
// under concurrent lanes and passed under lighter load inside ONE session on ONE commit — and the scaling
// had never engaged, because `readBoxLoad` divided a box-wide loadavg by `cpus().length` (24) while
// `.claude/hooks/cpu-fence.sh` (#1835) had capped the whole session tree at CPUQuota 800% = EIGHT cores.
// The factor could only move above per-core 1.0, i.e. loadavg 24 — a number the fence itself prevents. A
// scaled budget that can never scale is the lying-instrument shape, not a too-small base.
//
// Both directions are planted, because a quota walk that always answered `undefined` would restore the bug
// silently and one that always answered a number would shrink a dedicated box's budgets.
test("#1985 — the cgroup quota walk takes the MINIMUM over the ancestry, and reads `max` as unbounded", () => {
  const ancestry = (path: string): string => {
    if (path === "/proc/self/cgroup") {
      return "0::/user.slice/app.scope\n";
    }
    // The ANCESTOR is tighter than the leaf — the case a leaf-only read gets wrong.
    return path === "/sys/fs/cgroup/user.slice/cpu.max" ? "200000 100000" : "800000 100000";
  };
  expect(cgroupQuotaCores(ancestry)).toBe(2);

  // ORB_DEDICATED_BOX=1 sets no ceiling at all: every `cpu.max` reads `max`, and the walk must say so
  // rather than inventing a cap — otherwise the solo box's budgets stop being byte-identical to their base.
  expect(cgroupQuotaCores(() => "max 100000")).toBeUndefined();
  // A v1-only / unreadable `/proc/self/cgroup` is unbounded too, never a crash and never a 0-core divisor.
  expect(cgroupQuotaCores(() => undefined)).toBeUndefined();
  expect(cgroupQuotaCores(() => "3:cpu:/user.slice\n")).toBeUndefined();
});

test("#1985 — effectiveCpuCount is bounded by the quota AND by the physical count, and never below 1", () => {
  const physical = cpus().length;
  const fenced = (path: string): string => (path === "/proc/self/cgroup" ? "0::/app.scope\n" : "800000 100000");
  expect(effectiveCpuCount(fenced)).toBe(Math.min(physical, 8));
  // A quota WIDER than the box is not a licence to inflate the denominator (which would shrink the factor).
  const wide = (path: string): string => (path === "/proc/self/cgroup" ? "0::/app.scope\n" : "99000000 100000");
  expect(effectiveCpuCount(wide)).toBe(physical);
  // A sub-core quota still leaves a usable divisor — a 0 here would make computeLoadFactor return 1 forever.
  const tiny = (path: string): string => (path === "/proc/self/cgroup" ? "0::/app.scope\n" : "10000 100000");
  expect(effectiveCpuCount(tiny)).toBe(1);
  // Unbounded ⇒ the physical count, so the pre-#1985 behaviour is exactly what an unfenced box still gets.
  expect(effectiveCpuCount(() => "max 100000")).toBe(physical);
});

test("#1985 — under the live session fence a real multi-lane loadavg finally MOVES the budget", () => {
  // The regression in one line: at loadavg 16 the old denominator (24 threads) returned factor 1 and a
  // 60s budget stayed 60s; the fenced denominator (8 cores) returns 2 and the same base becomes 120s.
  expect(computeLoadFactor(16, 24)).toBe(1);
  expect(computeLoadFactor(16, 8)).toBe(2);
  expect(budget(60_000, () => ({ loadavg1: 16, cpuCount: 8 }))).toBe(120_000);
  // …and the quiet-box invariant is UNTOUCHED: below one load per available core, still byte-identical.
  expect(budget(60_000, () => ({ loadavg1: 6.8, cpuCount: 8 }))).toBe(60_000);
});
test("#2206 — QUOTA THROTTLING stretches a budget in the band loadavg alone calls quiet", () => {
  // THE HOLE, stated as the pair that used to disagree with reality. `computeLoadFactor` is
  // `max(1, loadavg/cores)`, so EVERY load below one-per-core priced at exactly 1.00 — including a fenced
  // session pinned at 99% of its quota. The barrier's planter died there: a 257s pass against a 300s
  // budget, killed at `loadavg 6.0/8 cores`, where the factor was 1.00 and the uplift never engaged.
  const fenced = { loadavg1: 6, cpuCount: 8 } as const;
  expect(computeLoadFactor(fenced.loadavg1, fenced.cpuCount)).toBe(1);
  expect(budget(300_000, () => fenced)).toBe(300_000);

  // With the kernel's own throttling record the same reading is no longer "quiet": 12.4% of periods ended
  // stopped by the quota (the live measurement on this session's scope, 2026-09-12), and the identity
  // 1/(1-r) prices that at ~1.14 — the order of the ≥1.17 slip that killed the pass.
  const throttled = { ...fenced, throttle: { periods: 1_282_742, throttled: 158_691 } } as const;
  expect(boxFactor(throttled)).toBeCloseTo(1.142, 2);
  expect(budget(300_000, () => throttled)).toBe(342_354);

  // The two signals compose as a MAXIMUM, never a product: whichever says the box is worse wins, so a
  // genuinely loaded box is unaffected by a low throttle rate and vice versa.
  expect(boxFactor({ loadavg1: 32, cpuCount: 8, throttle: { periods: 100, throttled: 10 } })).toBe(4);
  expect(boxFactor({ loadavg1: 1, cpuCount: 8, throttle: { periods: 100, throttled: 50 } })).toBe(2);
  // …and the cap still binds, so a fully-throttled tree cannot inflate a budget without limit.
  expect(boxFactor({ loadavg1: 1, cpuCount: 8, throttle: { periods: 100, throttled: 100 } })).toBe(FACTOR_CAP);
});

test("#2206 — the QUIET-BOX INVARIANT survives: no fence, no plant, no throttle ⇒ byte-identical budgets", () => {
  // This is the control that keeps the arm above honest. If a throttle sample could raise a budget on an
  // UNFENCED box, every solo measurement would silently grow headroom and the policy's core promise —
  // "a quiet box leaves every budget byte-identical to its base" — would be gone.
  expect(boxFactor({ loadavg1: 6, cpuCount: 8 })).toBe(1);
  expect(boxFactor({ loadavg1: 6, cpuCount: 8, throttle: { periods: 1000, throttled: 0 } })).toBe(1);
  expect(budget(300_000, () => ({ loadavg1: 6, cpuCount: 8, throttle: { periods: 1000, throttled: 0 } }))).toBe(300_000);
  // A malformed or empty sample is "no reading", never a divide-by-zero and never an uplift.
  expect(boxFactor({ loadavg1: 6, cpuCount: 8, throttle: { periods: 0, throttled: 0 } })).toBe(1);

  // A RATE arm deliberately does NOT take the throttle signal (the counters are cumulative over a session
  // scope that lives for hours, so they are a prior, not a statement about the measurement window). This
  // asserts that deliberate non-change, so a later edit that folds it in has to argue with a test.
  expect(judgeMeasurementLoad({ loadavg1: 6, cpuCount: 8, throttle: { periods: 100, throttled: 50 } }, "x").disposition).toBe("complete");
});

test("#2206 — the throttle reading is the TIGHTEST over the cgroup ancestry, or nothing at all", () => {
  const tree =
    (stats: Readonly<Record<string, string>>) =>
    (path: string): string | undefined =>
      path === "/proc/self/cgroup" ? "0::/user.slice/app.scope\n" : stats[path];
  // An ancestor throttled harder than the leaf is what actually bounds this tree, so it is what counts.
  const sample = readCpuThrottle(
    tree({
      "/sys/fs/cgroup/user.slice/app.scope/cpu.stat": "nr_periods 1000\nnr_throttled 50\n",
      "/sys/fs/cgroup/user.slice/cpu.stat": "nr_periods 1000\nnr_throttled 400\n",
    }),
  );
  expect(sample).toEqual({ periods: 1000, throttled: 400 });
  // No counters anywhere ⇒ undefined, which `throttleFactor` reads as factor 1 (the unfenced box).
  expect(readCpuThrottle(tree({}))).toBeUndefined();
  // A cpu.stat without the throttle counters is not a zero reading, it is NO reading.
  expect(readCpuThrottle(tree({ "/sys/fs/cgroup/user.slice/app.scope/cpu.stat": "usage_usec 5\n" }))).toBeUndefined();
  // A v1-only cgroup line is unreadable here for the same reason the quota walk refuses it.
  expect(readCpuThrottle(() => "3:cpu:/user.slice\n")).toBeUndefined();
});
