// @instrument-proof: every budget rule below is exercised by a PLANTED breach — an app-owned dirty
// animation, a counterfeit Base UI attribution tuple, a real non-virtualized shift, a blocking LoAF past
// 50ms — and each must come back FAILING. The markers moved here at #1315 when the retired `pnpm motion-audit`'s
// argv door was deleted: the engine's proofs never lived in that CLI, and the gate's question is whether
// this mirror carries both classes (docs/architecture/core/Core-Tooling-Law.md §4.5).
// @instrument-absence-proof: an ABSENT apparatus and an EMPTY population are proven not to read clean —
// no `__orb` bridge is zeros that are explicitly NOT a verdict, an empty raw frame population is an
// evidence gap, and a null percentage is never rendered as 0%.
//
// The CLS verdict rule retained by Snap's motion arm (issue #109, 2026-08-16): the budget gates on the
// NON-VIRTUALIZED total, while raw + virtualized stay printed. Found by lane ae-shell-motion — a no-probe
// home→chat journey measured ~0.26 of CLS that was purely the message list settling on mount, which
// motion-stats.ts already classifies (`virtualized: true`) and warn-suppresses but still folded into the
// gated number, making "journey under 0.1" unreachable by any app fix short of changing the virtualizer.
// This file's home is the tests/tooling/motion-audit mirror (Spine-Testing.md §2); the browser
// half — that a virtualized-tagged shift really does move only raw — is tests/client/lib/motion-stats.ct.tsx.
import type { AnimationRecord, AuditData, BrowserEnvironmentEvidence, MotionFlagRecord } from "../../../tooling/src/motion-audit/index.ts";
import {
  animationTotals,
  apparatusGap,
  calibratedDroppedFramePct,
  clsBudgetBasis,
  clsBudgeted,
  clsOverBudget,
  clsTotals,
  DROPPED_FRAME_BUDGET_PCT,
  droppedFramePct,
  evaluateMotionAudit,
  FRAME_POPULATION_RESOLUTION_FLOOR,
  framePopulationBasis,
  loafOverBudget,
  loafTotals,
  motionEvidenceGaps,
  observedClsGap,
  observedClsTotals,
} from "../../../tooling/src/motion-audit/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const DESKTOP_ENVIRONMENT: BrowserEnvironmentEvidence = {
  requested: {
    device: null,
    viewport: { width: 1280, height: 800 },
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  applied: {
    device: null,
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    userAgent: null,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  actual: {
    device: { kind: "desktop" },
    viewport: { width: 1280, height: 800 },
    innerViewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 desktop",
    deviceScaleFactor: 1,
    maxTouchPoints: 0,
    hasTouch: false,
    pointer: "fine",
    hover: "hover",
    isMobile: false,
    colorScheme: "light",
    reducedMotion: false,
    contrast: "no-preference",
    reducedTransparency: false,
  },
  mismatches: [],
};

/** A collected run with EVERYTHING present, so each gap test plants exactly one absence. */
function auditData(over: Partial<AuditData> = {}): AuditData {
  return {
    environment: DESKTOP_ENVIRONMENT,
    applicationMotion: null,
    motion: {
      loafs: [],
      cls: 0,
      virtualizedCls: 0,
      nonVirtualizedCls: 0,
      observedCls: 0,
      observedVirtualizedCls: 0,
      observedNonVirtualizedCls: 0,
      worstBlocking: 0,
      worstShift: 0,
    },
    animations: [],
    frames: { raw: { total: 12, dropped: 0, pct: 0 }, classified: { total: 0, dropped: 0 }, budgeted: { total: 12, dropped: 0, pct: 0 } },
    pageErrors: [],
    traceEventCount: 900,
    stepFailed: false,
    reachFailures: 0,
    // Default = an ENTRY window (no trusted input), which is what every pre-#1071 case in this file
    // measured. The interaction arms below set it explicitly.
    measuredInput: false,
    // Default = no TRANSIENT raises, so every pre-#1070 case keeps the end-of-window sample's exact
    // arithmetic. The transient arms below plant them explicitly.
    flags: [],
    ...over,
  };
}

function dirtyAnimation(over: Partial<AnimationRecord> = {}): AnimationRecord {
  return {
    target: '[data-slot="collapsible-panel"]',
    properties: ["height"],
    compositorClean: false,
    ...over,
  };
}

test("only an exactly attributed Base UI height lifecycle leaves the dirty-animation budget", () => {
  const starting = dirtyAnimation({
    targetState: { startingStyle: false, endingStyle: false },
    lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
  });
  const ending = dirtyAnimation({
    targetState: { startingStyle: false, endingStyle: false },
    lifecycleState: { startingStyle: false, endingStyle: true, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "ending-style" },
  });

  expect(animationTotals([starting, ending])).toMatchObject({ rawDirty: 2, sanctionedLibrary: 2, budgetedDirty: 0, gaps: [] });
  expect(evaluateMotionAudit(auditData({ animations: [starting, ending] }), 2500)).toMatchObject({
    dirtyAnimations: 2,
    sanctionedLibraryAnimations: 2,
    budgetedDirtyAnimations: 0,
    budgetsPass: true,
    gaps: [],
  });
});

test("application, unattributed legacy, and unsupported Base UI dirty animations remain budget failures", () => {
  const application = dirtyAnimation({
    targetState: { startingStyle: false, endingStyle: false },
    attribution: { owner: "application", mechanism: "css-transition" },
  });
  const legacy = dirtyAnimation();
  const unsupportedLibrary = dirtyAnimation({
    properties: ["width"],
    lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
  });

  expect(animationTotals([application, legacy, unsupportedLibrary])).toMatchObject({
    rawDirty: 3,
    sanctionedLibrary: 0,
    budgetedDirty: 3,
    gaps: [],
  });
  expect(evaluateMotionAudit(auditData({ animations: [application, legacy, unsupportedLibrary] }), 2500)).toMatchObject({
    dirtyAnimations: 3,
    sanctionedLibraryAnimations: 0,
    budgetedDirtyAnimations: 3,
    budgetsPass: false,
    gaps: [],
  });
});

test("a counterfeit Base UI owner/phase tuple is an attribution evidence gap", () => {
  const counterfeit = dirtyAnimation({
    targetState: { startingStyle: false, endingStyle: true },
    lifecycleState: { startingStyle: false, endingStyle: true, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
  });

  expect(animationTotals([counterfeit])).toMatchObject({ rawDirty: 1, sanctionedLibrary: 0, budgetedDirty: 1 });
  expect(animationTotals([counterfeit]).gaps.map((gap) => gap.evidence)).toEqual(["Base UI animation attribution"]);
  expect(evaluateMotionAudit(auditData({ animations: [counterfeit] }), 2500).gaps.map((gap) => gap.evidence)).toEqual(["Base UI animation attribution"]);
});

/** The in-page snapshot fields the verdict reads. Typed off the probe's own parameter so the fixture can
 *  never drift from the shape `clsTotals` actually parses (a probe the reader can't read is a lying proof). */
type Snapshot = NonNullable<Parameters<typeof clsTotals>[0]>;
const FRAME_REPORTER_KEY = "frame_reporter";
const AFFECTS_SMOOTHNESS_KEY = "affects_smoothness";

function snapshot(
  over: Pick<Snapshot, "cls" | "virtualizedCls" | "nonVirtualizedCls" | "observedCls" | "observedVirtualizedCls" | "observedNonVirtualizedCls">,
): Snapshot {
  return { loafs: [], worstBlocking: 0, worstShift: 0, ...over };
}

type Loaf = Snapshot["loafs"][number];

function loaf(over: Partial<Loaf> = {}): Loaf {
  return {
    startTime: 100,
    duration: 80,
    blockingDuration: 30,
    styleAndLayoutStart: 150,
    scripts: [],
    ...over,
  };
}

function motionWith(...loafs: Loaf[]): Snapshot {
  return { ...snapshot({ cls: 0, virtualizedCls: 0, nonVirtualizedCls: 0 }), loafs };
}

function selectEntrance(firstForTrigger: boolean, confirmed = true): Partial<Loaf> {
  return {
    selectEntrance: {
      id: 7,
      startedAt: 90,
      ...(confirmed ? { confirmedAt: 110 } : {}),
      endedAt: 220,
      firstForTrigger,
    },
  };
}

function appScript(): Loaf["scripts"][number] {
  return {
    sourceURL: "http://127.0.0.1:5173/packages/client/src/features/user-admin/app-owned-work.ts",
    duration: 90,
    forcedStyleAndLayoutDuration: 30,
    invoker: "FrameRequestCallback",
    sourceFunctionName: "runAppWork",
  };
}

test("a confirmed first sealed Select entrance receives the measured first-only blocking allowance", () => {
  const motion = motionWith(loaf({ blockingDuration: 181, ...selectEntrance(true) }));

  expect(loafTotals(motion)).toMatchObject({ rawWorstBlocking: 181, classifiedInitializations: 1, budgetedWorstBlocking: 41, budgetedStyleLayout: 0 });
  expect(loafOverBudget(motion)).toBe(false);
});

test("a confirmed repeat Select entrance may carry its expected style frame but gets no blocking allowance", () => {
  const passing = motionWith(loaf({ blockingDuration: 42, ...selectEntrance(false) }));
  const blocking = motionWith(loaf({ blockingDuration: 51, styleAndLayoutStart: 0, ...selectEntrance(false) }));

  expect(loafTotals(passing)).toMatchObject({ classifiedInitializations: 0, budgetedWorstBlocking: 42, budgetedStyleLayout: 0 });
  expect(loafOverBudget(passing)).toBe(false);
  expect(loafOverBudget(blocking)).toBe(true);
});

test("the first-only allowance cannot hide app-owned blocking beyond the unchanged 50ms budget", () => {
  const motion = motionWith(loaf({ blockingDuration: 191, ...selectEntrance(true) }));

  expect(loafTotals(motion).budgetedWorstBlocking).toBe(51);
  expect(loafOverBudget(motion)).toBe(true);
});

test("a first Select allowance is consumed once and cannot hide a second app-owned block in the same lifetime", () => {
  const motion = motionWith(
    loaf({ startTime: 100, duration: 80, blockingDuration: 181, styleAndLayoutStart: 0, ...selectEntrance(true) }),
    loaf({ startTime: 190, duration: 30, blockingDuration: 130, styleAndLayoutStart: 0, scripts: [appScript()], ...selectEntrance(true) }),
  );

  expect(loafTotals(motion)).toMatchObject({ classifiedInitializations: 1, budgetedWorstBlocking: 130 });
  expect(loafOverBudget(motion)).toBe(true);
});

test("recognizable concurrent app style remains red inside a confirmed Select lifetime", () => {
  const motion = motionWith(
    loaf({ startTime: 100, duration: 80, styleAndLayoutStart: 150, ...selectEntrance(true) }),
    loaf({ startTime: 190, duration: 30, blockingDuration: 0, styleAndLayoutStart: 205, scripts: [appScript()], ...selectEntrance(true) }),
  );

  expect(loafTotals(motion)).toMatchObject({ classifiedInitializations: 1, budgetedStyleLayout: 1 });
  expect(loafOverBudget(motion)).toBe(true);
});

test("recognizable app attribution vetoes the primary Select allowance itself", () => {
  const motion = motionWith(loaf({ blockingDuration: 130, styleAndLayoutStart: 0, scripts: [appScript()], ...selectEntrance(true) }));

  expect(loafTotals(motion)).toMatchObject({ classifiedInitializations: 0, budgetedWorstBlocking: 130 });
  expect(loafOverBudget(motion)).toBe(true);
});

test("unconfirmed Select intent and non-Select portals remain ordinary style/layout failures", () => {
  const unconfirmed = motionWith(loaf({ blockingDuration: 0, ...selectEntrance(false, false) }));
  const nonSelect = motionWith(loaf({ blockingDuration: 0 }));

  expect(loafOverBudget(unconfirmed)).toBe(true);
  expect(loafOverBudget(nonSelect)).toBe(true);
});

// ── #1647: the bounded input-dispatch layout-frame exemption (#1316's proposal) ─────────────────────
/** The measured shape: React's `dispatchDiscreteEvent` handling the click, no forced mid-script reflow,
 *  and the frame's own `styleAndLayoutStart` at/after the script's end (the render-phase tail). */
function dispatchScript(over: Partial<Loaf["scripts"][number]> = {}): Loaf["scripts"][number] {
  return {
    sourceURL: "http://127.0.0.1:5173/@fs/react-dom_client.js",
    duration: 22,
    forcedStyleAndLayoutDuration: 0,
    sourceFunctionName: "dispatchDiscreteEvent",
    ...over,
  };
}

test("#1647: the bounded single input-dispatch layout frame passes and is named in the totals", () => {
  const motion = motionWith(loaf({ startTime: 0, duration: 22, blockingDuration: 0, styleAndLayoutStart: 22, scripts: [dispatchScript()] }));

  expect(loafTotals(motion)).toMatchObject({ budgetedStyleLayout: 0, boundedInputDispatchExempt: true });
  expect(loafOverBudget(motion)).toBe(false);
});

test("#1647 condition (a): a layout frame with NO input-dispatch script still reds", () => {
  const motion = motionWith(
    loaf({ startTime: 0, duration: 22, blockingDuration: 0, styleAndLayoutStart: 22, scripts: [dispatchScript({ sourceFunctionName: "someOtherWork" })] }),
  );

  expect(loafTotals(motion)).toMatchObject({ budgetedStyleLayout: 1, boundedInputDispatchExempt: false });
  expect(loafOverBudget(motion)).toBe(true);
});

test("#1647 condition (b): a script that FORCED synchronous layout still reds, even riding the dispatch script", () => {
  const motion = motionWith(
    loaf({ startTime: 0, duration: 22, blockingDuration: 0, styleAndLayoutStart: 22, scripts: [dispatchScript({ forcedStyleAndLayoutDuration: 6 })] }),
  );

  expect(loafTotals(motion)).toMatchObject({ budgetedStyleLayout: 1, boundedInputDispatchExempt: false });
  expect(loafOverBudget(motion)).toBe(true);
});

test("#1647 condition (c): style/layout INTERLEAVED with (before) the script's own span still reds", () => {
  // The script reports 22ms of work but styleAndLayoutStart sits at 10ms in — before the script finished,
  // i.e. interleaved rather than the render-phase tail.
  const motion = motionWith(loaf({ startTime: 0, duration: 22, blockingDuration: 0, styleAndLayoutStart: 10, scripts: [dispatchScript({ duration: 22 })] }));

  expect(loafTotals(motion)).toMatchObject({ budgetedStyleLayout: 1, boundedInputDispatchExempt: false });
  expect(loafOverBudget(motion)).toBe(true);
});

test("#1647 condition (d): a SECOND layout frame in the window disqualifies the pairing entirely — both count", () => {
  const motion = motionWith(
    loaf({ startTime: 0, duration: 22, blockingDuration: 0, styleAndLayoutStart: 22, scripts: [dispatchScript()] }),
    loaf({ startTime: 100, duration: 30, blockingDuration: 0, styleAndLayoutStart: 130, scripts: [appScript()] }),
  );

  expect(loafTotals(motion)).toMatchObject({ budgetedStyleLayout: 2, boundedInputDispatchExempt: false });
  expect(loafOverBudget(motion)).toBe(true);
});

test("a purely virtualized journey moves the RAW total and never the verdict", () => {
  // The measured shape: 0.26 of instability, all of it virtual-row reconciliation.
  const motion = snapshot({ cls: 0.26, virtualizedCls: 0.26, nonVirtualizedCls: 0 });
  expect(clsTotals(motion)).toEqual({ raw: 0.26, virtualized: 0.26, budgeted: 0 });
  expect(clsOverBudget(motion, false)).toBe(false);
});

test("a real app shift still fails the budget even when virtualized settling dwarfs it", () => {
  // The regression this must not become: excluding virtualized shifts must not excuse a real one.
  const motion = snapshot({ cls: 0.41, virtualizedCls: 0.26, nonVirtualizedCls: 0.15 });
  expect(clsOverBudget(motion, false)).toBe(true);
  expect(clsTotals(motion).raw).toBe(0.41);
});

test("the non-virtualized total is judged against the same 0.1 CWV ceiling as before", () => {
  expect(clsOverBudget(snapshot({ cls: 0.1, virtualizedCls: 0, nonVirtualizedCls: 0.1 }), false)).toBe(false);
  expect(clsOverBudget(snapshot({ cls: 0.11, virtualizedCls: 0, nonVirtualizedCls: 0.11 }), false)).toBe(true);
});

test("a page bundle predating the split (no virtualized fields) keeps the OLD verdict, never a free pass", () => {
  // `--isolated --ref <old sha>` legitimately answers from a page without the three-way split. Reading
  // that as "nothing was virtualized" reproduces the pre-#109 behaviour; reading it as 0 would be a lie.
  const legacy = snapshot({ cls: 0.26 });
  expect(clsTotals(legacy)).toEqual({ raw: 0.26, virtualized: 0, budgeted: 0.26 });
  expect(clsOverBudget(legacy, false)).toBe(true);
});

test("no snapshot at all (no __orb bridge) is zeros, not NaN — and those zeros are NOT a verdict", () => {
  // The totals stay total (a reader that NaNs is worse), but #409 moved the consequence: the run that
  // produced no snapshot is an INSTRUMENT ERROR at the verdict seam, never a clean CLS of 0.
  expect(clsTotals(null)).toEqual({ raw: 0, virtualized: 0, budgeted: 0 });
  expect(clsOverBudget(null, false)).toBe(false);
  expect(motionEvidenceGaps(auditData({ motion: null }), 2500).map((g) => g.evidence)).toContain("the __orb motion snapshot");
});

test("PipelineReporter reads Chrome's nested frame_reporter payload and ignores paired end events", () => {
  const events = [
    { name: "PipelineReporter", args: { [FRAME_REPORTER_KEY]: { state: "STATE_PRESENTED_ALL", [AFFECTS_SMOOTHNESS_KEY]: false } } },
    { name: "PipelineReporter", args: {} },
    { name: "PipelineReporter", args: { [FRAME_REPORTER_KEY]: { state: "STATE_DROPPED", [AFFECTS_SMOOTHNESS_KEY]: true } } },
    { name: "PipelineReporter", args: {} },
  ];

  expect(droppedFramePct(events)).toEqual({ total: 2, dropped: 1, pct: 50 });
});

// ── ZERO HYGIENE (#409): absent evidence is never a clean number ────────────────────────────────────

test("an EMPTY frame population has no percentage — null, never 0%", () => {
  // The defect: `total === 0 ? 0 : …` printed "0% dropped" for a window in which nothing composited,
  // which reads exactly like perfect smoothness.
  expect(droppedFramePct([])).toEqual({ total: 0, dropped: 0, pct: null });
  expect(calibratedDroppedFramePct([])).toEqual({
    raw: { total: 0, dropped: 0, pct: null },
    classified: { total: 0, dropped: 0 },
    budgeted: { total: 0, dropped: 0, pct: null },
  });
});

test("an empty RAW frame population is an evidence gap; an empty BUDGETED one (all classified) is not", () => {
  // The exemption legitimately consumes the whole population — the raw evidence still exists, so that
  // run is honestly clean. Only an empty RAW population means nothing was observed at all.
  const allClassified = auditData({
    frames: { raw: { total: 4, dropped: 4, pct: 100 }, classified: { total: 4, dropped: 4 }, budgeted: { total: 0, dropped: 0, pct: null } },
  });
  expect(motionEvidenceGaps(allClassified, 2500)).toEqual([]);

  const nothingObserved = auditData({
    frames: { raw: { total: 0, dropped: 0, pct: null }, classified: { total: 0, dropped: 0 }, budgeted: { total: 0, dropped: 0, pct: null } },
  });
  expect(motionEvidenceGaps(nothingObserved, 2500).map((g) => g.evidence)).toEqual(["the frame population"]);
});

test("the frame-population gap separates a quiet window from tracing that never ran", () => {
  // Measured (#409): the live app at --window 100 reproducibly composites ZERO frames while the trace
  // still delivers ~1000 events — so an empty population is not proof the instrument broke, and the
  // message must send the operator to the right remedy.
  const empty = { raw: { total: 0, dropped: 0, pct: null }, classified: { total: 0, dropped: 0 }, budgeted: { total: 0, dropped: 0, pct: null } };
  const quiet = motionEvidenceGaps(auditData({ frames: empty, traceEventCount: 966 }), 100);
  const noTrace = motionEvidenceGaps(auditData({ frames: empty, traceEventCount: 0 }), 100);

  expect(quiet[0]?.detail).toContain("966 events but 0 PipelineReporter frames");
  expect(noTrace[0]?.detail).toContain("NO events at all");
});

test("a dropped frame that does not affect smoothness stays outside the motion budget", () => {
  const events = [{ name: "PipelineReporter", args: { [FRAME_REPORTER_KEY]: { state: "STATE_DROPPED", [AFFECTS_SMOOTHNESS_KEY]: false } } }];

  expect(droppedFramePct(events)).toEqual({ total: 1, dropped: 0, pct: 0 });
});

function selectMark(id: number, phase: "start" | "confirmed" | "end", ts: number): object {
  return { name: `orb:select-entrance:${id}:${phase}`, cat: "blink.user_timing", ph: "I", ts };
}

function pipelineFrame(id: number, start: number, end: number, dropped: boolean): object[] {
  return [
    {
      name: "PipelineReporter",
      ph: "b",
      pid: 8,
      tid: 9,
      id2: { local: id },
      ts: start,
      args: {
        [FRAME_REPORTER_KEY]: {
          state: dropped ? "STATE_DROPPED" : "STATE_PRESENTED_ALL",
          [AFFECTS_SMOOTHNESS_KEY]: dropped,
        },
      },
    },
    { name: "PipelineReporter", ph: "e", pid: 8, tid: 9, id2: { local: id }, ts: end, args: {} },
  ];
}

test("only paired frames overlapping a confirmed sealed Select entrance leave the dropped-frame budget", () => {
  const events = [
    selectMark(3, "start", 100_000),
    selectMark(3, "confirmed", 108_000),
    ...pipelineFrame(1, 96_000, 112_000, true),
    ...pipelineFrame(2, 120_000, 145_000, true),
    selectMark(3, "end", 150_000),
    ...pipelineFrame(3, 160_000, 178_000, false),
  ];

  expect(calibratedDroppedFramePct(events)).toEqual({
    raw: { total: 3, dropped: 2, pct: 66.67 },
    classified: { total: 2, dropped: 2 },
    budgeted: { total: 1, dropped: 0, pct: 0 },
  });
});

test("an app-owned dropped frame after the Select entrance remains an ordinary red budget input", () => {
  const events = [
    selectMark(4, "start", 100_000),
    selectMark(4, "confirmed", 105_000),
    ...pipelineFrame(1, 100_000, 120_000, true),
    selectMark(4, "end", 130_000),
    ...pipelineFrame(2, 150_000, 170_000, true),
  ];

  expect(calibratedDroppedFramePct(events)).toEqual({
    raw: { total: 2, dropped: 2, pct: 100 },
    classified: { total: 1, dropped: 1 },
    budgeted: { total: 1, dropped: 1, pct: 100 },
  });
});

test("unconfirmed Select marks, non-Select marks, and unpaired frames receive no dropped-frame exemption", () => {
  const events = [
    selectMark(5, "start", 100_000),
    selectMark(5, "end", 140_000),
    { name: "orb:menu-entrance:1:confirmed", cat: "blink.user_timing", ph: "I", ts: 105_000 },
    ...pipelineFrame(1, 110_000, 125_000, true),
    {
      name: "PipelineReporter",
      ph: "b",
      pid: 8,
      tid: 9,
      id2: { local: 2 },
      ts: 150_000,
      args: { [FRAME_REPORTER_KEY]: { state: "STATE_DROPPED", [AFFECTS_SMOOTHNESS_KEY]: true } },
    },
  ];

  expect(calibratedDroppedFramePct(events)).toEqual({
    raw: { total: 2, dropped: 2, pct: 100 },
    classified: { total: 0, dropped: 0 },
    budgeted: { total: 2, dropped: 2, pct: 100 },
  });
});

test("a requested/actual browser-environment mismatch is an instrument error input", () => {
  const environment: BrowserEnvironmentEvidence = {
    ...DESKTOP_ENVIRONMENT,
    actual: { ...DESKTOP_ENVIRONMENT.actual, device: { kind: "unmatched" }, pointer: "fine", isMobile: null },
    mismatches: ["pointer expected coarse but observed fine", "touch expected present but maxTouchPoints=0"],
  };

  const gaps = motionEvidenceGaps(auditData({ environment }), 2500);
  expect(gaps.map((gap) => gap.evidence)).toEqual(["the requested browser environment"]);
  expect(gaps[0]?.detail).toContain("viewport-only or partial device arm is not a mobile measurement");
});

// ── APPARATUS DIAGNOSIS (#515) — the permanent pin for a WRONG diagnosis printed with confidence ──────
// motion-audit printed "the __orb dev bridge is ABSENT — this run is not a verdict" against a page that
// exposes all 21 bridge keys (snap read them on the same URL seconds later). The run had swallowed its
// data-app-ready timeout with `.catch(() => undefined)` and then asked about the bridge on a page that had
// not booted, so "no bridge" was true-at-that-instant and false-about-the-app. A lane reading that message
// goes hunting in the client for a bridge that is fine. The order of the two questions IS the fix.
const APPARATUS_URL = "http://localhost:5173/";
const READY_MS = 10_000;

test("READY-TIMEOUT is diagnosed as readiness, NEVER as a missing bridge", () => {
  // The #515 run, exactly: readiness never arrived, so the bridge answer is meaningless either way.
  for (const bridge of [false, true]) {
    const gap = apparatusGap({ url: APPARATUS_URL, ready: false, bridge, readyTimeoutMs: READY_MS });
    expect(gap?.evidence).toBe("app readiness (data-app-ready)");
    expect(gap?.detail).toContain("RETRYABLE");
    // The exact wrong claim, asserted as one that must not be made.
    expect(gap?.evidence).not.toContain("__orb dev bridge");
  }
});

test("BRIDGE-ABSENT is only claimed once the app HAS signalled ready", () => {
  // The real defect this arm exists for — a built app served without the dev bridge. Keeping it provable
  // is why the fix is a reordering and not a deletion.
  const gap = apparatusGap({ url: APPARATUS_URL, ready: true, bridge: false, readyTimeoutMs: READY_MS });
  expect(gap?.evidence).toBe("the __orb dev bridge");
  expect(gap?.detail).toContain("signalled data-app-ready and STILL");
});

test("a ready page WITH the bridge yields no gap — the audit may speak", () => {
  expect(apparatusGap({ url: APPARATUS_URL, ready: true, bridge: true, readyTimeoutMs: READY_MS })).toBeNull();
});

// ── #1071: the INTERACTION-CELL CLS basis ────────────────────────────────────────────────────────────
// THE PAID FALSE PASS, replayed. motion-stats.ts:26-35 records it: the docked LIST panel toggle moved
// `.shell-main` 272px across 7 entries — 0.207 of instability — and EVERY entry carried
// `hadRecentInput: true`, because motion-audit's measured click is a REAL CDP dispatch and the Layout
// Instability spec zeroes everything within 500ms of trusted input. `cls` read 0.0177 and the tool
// printed PASS while the shell visibly thrashed. Before this pin the receipt below evaluated
// `budgetsPass: true` (red-first receipt, lane cb-motion-truth).
const DOCKED_PANEL_TOGGLE = {
  cls: 0.0177,
  virtualizedCls: 0,
  nonVirtualizedCls: 0.0177,
  observedCls: 0.207,
  observedVirtualizedCls: 0,
  observedNonVirtualizedCls: 0.207,
} as const;

test("an INTERACTION window is judged on the observed total — the paid docked-panel receipt FAILS", () => {
  const motion = snapshot({ ...DOCKED_PANEL_TOGGLE });
  expect(clsBudgetBasis(true)).toBe("observed-non-virtualized");
  expect(clsBudgeted(motion, true)).toBe(0.207);
  expect(clsOverBudget(motion, true)).toBe(true);
  expect(evaluateMotionAudit(auditData({ motion, measuredInput: true }), 2500)).toMatchObject({ budgetsPass: false, gaps: [] });
});

test("the SAME receipt on an ENTRY window keeps the #109 arithmetic exactly — polarity is preserved", () => {
  // The mechanism audit verified entry-cell polarity MATCHED: no trusted input happened, so the spec
  // metric excluded nothing and `nonVirtualizedCls` is the honest number. This must not move.
  const motion = snapshot({ ...DOCKED_PANEL_TOGGLE });
  expect(clsBudgetBasis(false)).toBe("non-virtualized");
  expect(clsBudgeted(motion, false)).toBe(0.0177);
  expect(clsOverBudget(motion, false)).toBe(false);
  expect(evaluateMotionAudit(auditData({ motion }), 2500)).toMatchObject({ budgetsPass: true, gaps: [] });
});

test("virtual-row reconciliation inside the click's own 500ms is still NOT an app defect (#109 holds)", () => {
  // The regression the observed split exists to prevent: a click that opens a chat settles the message
  // list within its own input window. Budgeting on raw `observedCls` would trade #1071's false PASS for
  // a false FAIL nothing an app fix could move.
  const motion = snapshot({
    cls: 0,
    virtualizedCls: 0,
    nonVirtualizedCls: 0,
    observedCls: 0.26,
    observedVirtualizedCls: 0.26,
    observedNonVirtualizedCls: 0,
  });
  expect(observedClsTotals(motion)).toEqual({ raw: 0.26, virtualized: 0.26, budgeted: 0 });
  expect(clsOverBudget(motion, true)).toBe(false);
});

test("a real app shift inside the input window still fails even when virtualized settling dwarfs it", () => {
  const motion = snapshot({
    cls: 0,
    virtualizedCls: 0,
    nonVirtualizedCls: 0,
    observedCls: 0.41,
    observedVirtualizedCls: 0.26,
    observedNonVirtualizedCls: 0.15,
  });
  expect(clsOverBudget(motion, true)).toBe(true);
});

test("an interaction against a bundle with no observed total REFUSES — it never falls back to `cls`", () => {
  // The one #109-shaped optional field that must not degrade gracefully: the fallback (`cls`) IS the
  // #1071 lie. `--isolated --ref <pre-#1071 sha>` + --selector gets an instrument error, not a verdict.
  const legacy = snapshot({ cls: 0.0177, virtualizedCls: 0, nonVirtualizedCls: 0.0177 });
  expect(clsBudgeted(legacy, true)).toBeNull();
  expect(clsOverBudget(legacy, true)).toBe(false);
  const evaluation = evaluateMotionAudit(auditData({ motion: legacy, measuredInput: true }), 2500);
  expect(evaluation.gaps.map((gap) => gap.evidence)).toEqual([observedClsGap().evidence]);
  // …and the SAME bundle on an entry window is not a gap at all: nothing was excluded there.
  expect(evaluateMotionAudit(auditData({ motion: legacy }), 2500).gaps).toEqual([]);
});

test("a missing snapshot stays the ONE __orb gap — the observed gap never double-reports it", () => {
  expect(evaluateMotionAudit(auditData({ motion: null, measuredInput: true }), 2500).gaps.map((g) => g.evidence)).toEqual(["the __orb motion snapshot"]);
});

test("observedClsTotals derives the remainder when only the two halves are served", () => {
  // Same tolerance the #109 fields already carry: a bundle that reports the raw + virtualized halves but
  // not the difference is read by subtraction, never by falling through to the spec total.
  // Binary-exact operands: the subtraction is deliberately unrounded (the collector already rounds to 4
  // decimals), so a fixture must not smuggle a float-precision failure into a semantic pin.
  expect(observedClsTotals(snapshot({ cls: 0, observedCls: 0.5, observedVirtualizedCls: 0.25 }))).toEqual({ raw: 0.5, virtualized: 0.25, budgeted: 0.25 });
  expect(observedClsTotals(snapshot({ cls: 0 }))).toBeNull();
  expect(observedClsTotals(null)).toBeNull();
});

// ── #1070: the TRANSIENT animation census ────────────────────────────────────────────────────────────
// `__orb.animations()` is a SAMPLE taken when the measured window closes. Every house duration is
// 130/220/360ms and the default window is 2,500ms, so a dirty transition launched by the measured click
// is finished ~2s before the sample: the dirty-animation budget was a continuous-LOOP detector, and its
// whole `sanctionedLibrary` machinery adjudicated a population that could not contain the transitions it
// exists to sanction. The `anim` channel of `__orb.flags()` carries the launch-time records; motion-audit
// re-judges them with the SAME (unchanged, #953) policy and never reads the channel's own `overBudget`.

function animFlag(over: Partial<MotionFlagRecord> = {}): MotionFlagRecord {
  return {
    tag: "anim",
    at: 120,
    offender: '[data-slot="tabs-indicator"]',
    detail: "animating non-compositor left, width",
    overBudget: true,
    ...over,
  };
}

test("a dirty transition that ENDED before the window sample is still budgeted (#1070)", () => {
  // The blindness itself: the end-of-window sample is EMPTY and the run passed regardless of what fired.
  const flags = [animFlag({ animation: { target: '[data-slot="tabs-indicator"]', properties: ["left", "width"], compositorClean: false } })];
  expect(animationTotals([], flags)).toMatchObject({ rawDirty: 0, transientDirty: 1, sanctionedLibrary: 0, budgetedDirty: 1 });
  expect(evaluateMotionAudit(auditData({ flags }), 2500)).toMatchObject({
    dirtyAnimations: 0,
    transientDirtyAnimations: 1,
    budgetedDirtyAnimations: 1,
    budgetsPass: false,
  });
});

test("the #953 allowance is applied to the transient population UNCHANGED — the console verdict is not read", () => {
  // The flag says `overBudget: true` (guide §3.7's console policy, #1069's fork). motion-audit re-judges
  // the raw facts: an exactly attributed Base UI height lifecycle leaves the budget, here as it does in
  // the active sample. Reading `overBudget` instead would import the open fork into this exit code.
  const ratified = animFlag({
    offender: '[data-slot="collapsible-panel"]',
    animation: {
      target: '[data-slot="collapsible-panel"]',
      properties: ["height"],
      compositorClean: false,
      targetState: { startingStyle: false, endingStyle: false },
      lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
      attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
    },
  });
  expect(ratified.overBudget).toBe(true);
  expect(animationTotals([], [ratified])).toMatchObject({ transientDirty: 1, sanctionedLibrary: 1, budgetedDirty: 0 });
  expect(evaluateMotionAudit(auditData({ flags: [ratified] }), 2500)).toMatchObject({ budgetsPass: true, gaps: [] });
});

test("a COMPOSITOR-CLEAN transient raise never enters the dirty population", () => {
  const clean = animFlag({ animation: { target: "[data-slot=drawer-popup]", properties: ["transform"], compositorClean: true } });
  expect(animationTotals([], [clean])).toMatchObject({ transientDirty: 0, budgetedDirty: 0 });
});

test("only the `anim` channel is consumed — [css]/[drop]/[space] raise no animation and are ignored", () => {
  const others = [
    animFlag({ tag: "drop", offender: "[data-slot=rail]" }),
    animFlag({ tag: "css", offender: ".dead-token" }),
    animFlag({ tag: "space", offender: "img", overBudget: false }),
  ];
  expect(animationTotals([], others)).toMatchObject({ rawDirty: 0, transientDirty: 0, budgetedDirty: 0 });
  expect(evaluateMotionAudit(auditData({ flags: others }), 2500)).toMatchObject({ budgetsPass: true });
});

test("an `anim` raise with NO launch record is an unattributed FAILURE, never a sanctioned zero", () => {
  // A bundle predating the attachment (or a raise site that dropped it) cannot be sanctioned — the
  // allowance needs the property set and the bound lifecycle. Same posture this file already takes for a
  // pre-#953 AnimationRecord: unattributed evidence is a failure, not a pass.
  const unrecorded = [animFlag()];
  expect(animationTotals([], unrecorded)).toMatchObject({ transientDirty: 1, sanctionedLibrary: 0, budgetedDirty: 1 });
  expect(evaluateMotionAudit(auditData({ flags: unrecorded }), 2500).budgetsPass).toBe(false);
});

test("a loop seen in BOTH populations is ONE offender — the counts never double", () => {
  // A continuous dirty animation starts inside the window AND is still running at the sample. Reporting
  // two offenders for one defect is the kind of inflation that makes an instrument's numbers unreadable.
  const running = dirtyAnimation({ target: "[data-slot=busy-spinner]", properties: ["margin-left"] });
  const raise = animFlag({
    offender: "[data-slot=busy-spinner]",
    animation: { target: "[data-slot=busy-spinner]", properties: ["margin-left"], compositorClean: false },
  });
  expect(animationTotals([running], [raise])).toMatchObject({ rawDirty: 1, transientDirty: 1, budgetedDirty: 1 });
});

test("with no flags at all the active-sample arithmetic is byte-for-byte the pre-#1070 behaviour", () => {
  const application = dirtyAnimation({
    targetState: { startingStyle: false, endingStyle: false },
    attribution: { owner: "application", mechanism: "css-transition" },
  });
  expect(animationTotals([application], [])).toMatchObject({ rawDirty: 1, transientDirty: 0, sanctionedLibrary: 0, budgetedDirty: 1 });
  expect(animationTotals([application])).toEqual(animationTotals([application], []));
});

test("a counterfeit Base UI tuple in the TRANSIENT population is an attribution gap too", () => {
  const counterfeit = animFlag({
    animation: {
      target: '[data-slot="menu-popup"]',
      properties: ["height"],
      compositorClean: false,
      targetState: { startingStyle: false, endingStyle: true },
      lifecycleState: { startingStyle: false, endingStyle: true, observedAt: "transition-run" },
      attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
    },
  });
  expect(animationTotals([], [counterfeit]).gaps.map((gap) => gap.evidence)).toEqual(["Base UI animation attribution"]);
});

// -- #1127 I3 - A PERCENTAGE IS ONLY A VERDICT OVER A POPULATION THAT CAN CARRY ONE -----------------
// side-eye retraction R-2, measured on the live app 2026-09-02 via `motion-audit --matrix`: the
// suppressed-motion cells printed `dropped-frames=30.77%` (of 13 frames) and `36.36%` (of 11) while
// their FULL-MOTION twins read `5.45% of 55` and `3.39% of 59`. Nothing was wrong with the arithmetic --
// the motion is suppressed by design there, so the population collapses and four slow frames become a
// third of the run. A reviewer with the twins refuted it; a lone cell has no twin, which is why the
// collapse now rides the cell's own line. The floor is DERIVED from the budget, so it can never drift
// away from the number it protects, and the controls below prove both directions.
test("#1127 the resolution floor is derived from the dropped-frame budget, not chosen", () => {
  // One dropped frame is worth 100/N points; below this N a SINGLE frame already exceeds the whole
  // budget, so the percentage stops separating "drops frames" from "one frame slipped".
  expect(FRAME_POPULATION_RESOLUTION_FLOOR).toBe(Math.ceil(100 / DROPPED_FRAME_BUDGET_PCT));
  expect(100 / (FRAME_POPULATION_RESOLUTION_FLOOR - 1)).toBeGreaterThan(DROPPED_FRAME_BUDGET_PCT);
  expect(100 / FRAME_POPULATION_RESOLUTION_FLOOR).toBeLessThanOrEqual(DROPPED_FRAME_BUDGET_PCT);
});

test("#1127 the measured suppressed-motion cells are COLLAPSED and their full-motion twins are VERDICTS", () => {
  // The exact populations from the two matrix cells and their twins -- the fixture IS the receipt.
  expect(framePopulationBasis(13)).toBe("collapsed");
  expect(framePopulationBasis(11)).toBe("collapsed");
  // THE PLANTED CONTROL IN THE OTHER DIRECTION: without it, "collapsed" would also pass on a tree where
  // the classifier had been wired to return it unconditionally.
  expect(framePopulationBasis(55)).toBe("verdict");
  expect(framePopulationBasis(59)).toBe("verdict");
});

// -- #1148 - AND A POPULATION THAT CANNOT CARRY THE RATE MINTS NEITHER ARM OF IT ------------------
// #1127 taught the PRINTER that `36.36% of 11` is "not a frames verdict"; the VERDICT kept gating on it,
// so the same eleven-frame suppressed-motion cell still minted a FAIL off four slow frames -- the tool
// contradicting its own receipt on the same page of output. The frames arm is now skipped over a
// collapsed/uncomputable population and the RESULT says `frames-budget=unjudged`; every OTHER budget
// still gates the run, which is what keeps this a narrowing of one dishonest arm rather than an amnesty.
// The fixture populations are the measured R-2 cells and their twins (11/13 collapsed, 55/59 verdict).
function framesOf(total: number, dropped: number): AuditData["frames"] {
  const pct = total === 0 ? null : Number(((dropped / total) * 100).toFixed(2));
  return { raw: { total, dropped, pct }, classified: { total: 0, dropped: 0 }, budgeted: { total, dropped, pct } };
}

test("#1148 a COLLAPSED frame population cannot mint a frames FAIL — the measured 36.36%-of-11 cell", () => {
  // 4 dropped of 11 = 36.36%, seven times the 5% budget, and NOT a verdict: one frame is worth 9.09pp.
  const collapsed = evaluateMotionAudit(auditData({ frames: framesOf(11, 4) }), 2500);
  // THE DEFECT, stated first: on the unmodified tool this read `false` — a FAIL minted off a percentage
  // the same run printed as "not a frames verdict".
  expect(collapsed.budgetsPass, "the run is clean on every budget that COULD speak").toBe(true);
  expect(collapsed.framesBudgetJudged, "11 frames is below the derived resolution floor").toBe(false);
  expect(collapsed.gaps, "a collapsed population is not an absent one — the run keeps its verdict").toEqual([]);
  // The other measured cell, same ruling.
  expect(evaluateMotionAudit(auditData({ frames: framesOf(13, 4) }), 2500).budgetsPass).toBe(true);
});

test("#1148 PLANTED CONTROL — a full population over the same budget still FAILS", () => {
  // 2 of 55 is 3.64%, under budget (the R-2 twin's neighbourhood); 6 of 55 is 10.91% and must still
  // fire, or the fix would have deleted the frames budget rather than narrowed it. NOTE the twin's own
  // measured 5.45% is itself OVER the 5% budget — a full population is judged on its merits either way.
  expect(evaluateMotionAudit(auditData({ frames: framesOf(55, 2) }), 2500)).toMatchObject({ framesBudgetJudged: true, budgetsPass: true });
  expect(evaluateMotionAudit(auditData({ frames: framesOf(55, 3) }), 2500).budgetsPass, "5.45% of 55 is a real over-budget verdict").toBe(false);
  expect(evaluateMotionAudit(auditData({ frames: framesOf(55, 6) }), 2500)).toMatchObject({ framesBudgetJudged: true, budgetsPass: false });
  // ...and at the exact floor, where a collapse must NOT be claimed.
  expect(evaluateMotionAudit(auditData({ frames: framesOf(FRAME_POPULATION_RESOLUTION_FLOOR, 2) }), 2500)).toMatchObject({
    framesBudgetJudged: true,
    budgetsPass: false,
  });
});

test("#1148 an unjudged frames budget silences ONLY the frames arm — every other budget still gates", () => {
  // The collapse must not become an amnesty: the same eleven-frame cell with a real page error, a failed
  // step, or a dirty animation still fails. Without this arm the fix would read as "collapsed = clean".
  const frames = framesOf(11, 4);
  expect(evaluateMotionAudit(auditData({ frames, pageErrors: ["TypeError: boom"] }), 2500).budgetsPass).toBe(false);
  expect(evaluateMotionAudit(auditData({ frames, stepFailed: true }), 2500).budgetsPass).toBe(false);
  expect(evaluateMotionAudit(auditData({ frames, animations: [dirtyAnimation()] }), 2500).budgetsPass).toBe(false);
});

test("#1148 an EMPTY population keeps its hard evidence gap — the zero-frame law is untouched", () => {
  // The ruled zero-frame arm (#409) and the matrix STATIC-EXPECTED contract both rest on this gap being
  // raised exactly once; narrowing the FAIL must not have swallowed it.
  const empty = evaluateMotionAudit(auditData({ frames: framesOf(0, 0) }), 2500);
  expect(empty.gaps.map((gap) => gap.evidence)).toEqual(["the frame population"]);
  expect(empty.framesBudgetJudged).toBe(false);
});

test("#1127 a single frame is UNCOMPUTABLE, not 0% -- `raw-frames=1` never prints a smoothness number", () => {
  // The single-run tell from the same drive: `motion-audit /` printed `0%` beside `raw-frames=1`.
  // A rate needs two observations; one frame is a sample, not a rate.
  expect(framePopulationBasis(1)).toBe("uncomputable");
  const oneFrame = evaluateMotionAudit(auditData({ frames: framesOf(1, 0) }), 2500);
  expect(oneFrame.gaps.map((gap) => gap.evidence)).toEqual(["the frame population"]);
  expect(oneFrame.gaps[0]?.detail).toContain("only 1 PipelineReporter frame");
  // ...and the boundaries either side, so an off-by-one in the classifier cannot pass.
  expect(framePopulationBasis(2)).toBe("collapsed");
  expect(framePopulationBasis(FRAME_POPULATION_RESOLUTION_FLOOR - 1)).toBe("collapsed");
  expect(framePopulationBasis(FRAME_POPULATION_RESOLUTION_FLOOR)).toBe("verdict");
});
