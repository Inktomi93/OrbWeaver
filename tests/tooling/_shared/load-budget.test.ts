// THE PLANTED CONTROLS for the one load policy (T14/T15/T16 of docs/design/1208-instrument-substrate.md
// §8). Every arm here injects its reading of the box instead of spinning the machine, because the whole
// point of the policy is that the box reading is a VALUE the judging functions take — a control that had to
// load the box could never run in the battery, and one that did would be measuring the battery.
//
// What each proves, and why the pair is the proof:
//   T14 a FORCED-LOAD reading makes a rate arm WITHHOLD, naming the loadavg — never a red;
//   T15 a QUIET reading leaves factor 1, every budget BYTE-IDENTICAL to its base and the arm MEASURING.
//       This is the positive control that the withhold cannot become a way to stop testing (#1040) and
//       that scaling cannot become a way to stop failing — without it T14 is satisfied by a stub that
//       always withholds;
//   T16 a genuinely HUNG subject under the SAME forced load still dies at its scaled ceiling, with a
//       message naming base×factor and the loadavg. The ceiling is not a way to hang.
import {
  annotateRateWithhold,
  budget,
  computeLoadFactor,
  isLoadKill,
  isTimeoutKill,
  judgeMeasurementLoad,
  LOAD_KILL_MARKER,
  LOAD_WITHHOLD_MARKER,
  loadKillError,
  loadKillMessage,
  loadLine,
  loadResultPairs,
  readBoxLoad,
  withheldPair,
  withholdRate,
} from "@orb/tooling/_shared/load-budget";
import { expect, test } from "../../support/tool-fixtures.ts";

/** Per-core 4.0 on a 24-core box — the FORCED-LOAD reading T14/T16 use. */
const LOADED = { loadavg1: 96, cpuCount: 24 } as const;
/** Per-core 0.3 — quiet, and quiet is EXACTLY factor 1 (the boundary is 1.0, not "some load"). */
const QUIET = { loadavg1: 7.2, cpuCount: 24 } as const;

const readLoaded = (): typeof LOADED => LOADED;
const readQuiet = (): typeof QUIET => QUIET;

// ── T14: a forced-load reading WITHHOLDS a rate arm, and names the box ──────────────────────────────
test("T14 — a rate arm on a forced-load reading WITHHOLDS with the loadavg receipt, and is never a red", () => {
  const verdict = withholdRate("motion-audit's dropped-frame rate", readLoaded);
  expect(verdict.withheld).toBe(true);
  // The receipt must NAME THE BOX: a withhold whose reason does not say what was loaded is indistinguishable
  // from a skip somebody left behind.
  expect(verdict.reason).toContain(LOAD_WITHHOLD_MARKER);
  expect(verdict.reason).toContain("96.0 / 24 cores");
  // …and it is emphatically NOT a kill: the two vocabularies are different tokens on purpose (a kill is a
  // run that broke, a withhold is a run that declined to vote), and conflating them is how "we chose not to
  // measure" would read as "the instrument failed".
  expect(verdict.reason).not.toContain(LOAD_KILL_MARKER);
  expect(isLoadKill(new Error(verdict.reason))).toBe(false);
  expect(withheldPair("dropped")).toBe("dropped=withheld");
});

test("T14 — the CT channel stamps the withhold where the REPORTER can see it", () => {
  // The CT twin of `task.meta`: a Playwright skip carries no output at all, so an un-annotated withhold is
  // a silent green. `annotateRateWithhold` is the ONLY thing that makes it legible to ct-flaky-reporter.
  const annotations: { type: string; description?: string }[] = [];
  const info = { annotations };
  const loaded = annotateRateWithhold(info, "a CT-measured rate", readLoaded);
  expect(loaded.withheld).toBe(true);
  expect(info.annotations).toHaveLength(1);
  expect(info.annotations[0]?.type).toBe("orb-load-withheld");
  expect(info.annotations[0]?.description).toContain(LOAD_WITHHOLD_MARKER);
  // The quiet arm stamps NOTHING — an annotation on a measuring test would inflate the census.
  const quiet = annotateRateWithhold(info, "a CT-measured rate", readQuiet);
  expect(quiet.withheld).toBe(false);
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
  // …and the arm MEASURES. Without this half, a stub that always withholds satisfies T14.
  expect(judgeMeasurementLoad(QUIET, "the dropped-frame rate").withheld).toBe(false);
});

test("T15 — the boundary is computeLoadFactor's own, not a second constant", () => {
  // Per-core EXACTLY 1.0 is the first contended reading: the factor leaves 1, so the withhold fires. The
  // 47.54% false red (#1040) was taken at per-core 1.04 — the first hair above this line.
  expect(computeLoadFactor(24, 24)).toBe(1);
  expect(judgeMeasurementLoad({ loadavg1: 24, cpuCount: 24 }, "x").withheld).toBe(false);
  expect(computeLoadFactor(24.96, 24)).toBeGreaterThan(1);
  expect(judgeMeasurementLoad({ loadavg1: 24.96, cpuCount: 24 }, "x").withheld).toBe(true);
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
