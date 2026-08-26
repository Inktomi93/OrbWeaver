// The CLS VERDICT rule of `pnpm motion-audit` (issue #109, 2026-08-16): the budget gates on the
// NON-VIRTUALIZED total, while raw + virtualized stay printed. Found by lane ae-shell-motion — a no-probe
// home→chat journey measured ~0.26 of CLS that was purely the message list settling on mount, which
// motion-stats.ts already classifies (`virtualized: true`) and warn-suppresses but still folded into the
// gated number, making "journey under 0.1" unreachable by any app fix short of changing the virtualizer.
// This file's home is the tests/tooling/motion-audit mirror (Spine-Testing.md §2); the browser
// half — that a virtualized-tagged shift really does move only raw — is tests/client/lib/motion-stats.ct.tsx.
import type { AuditData } from "../../../tooling/src/motion-audit/index.ts";
import {
  apparatusGap,
  calibratedDroppedFramePct,
  clsOverBudget,
  clsTotals,
  droppedFramePct,
  loafOverBudget,
  loafTotals,
  motionEvidenceGaps,
  parseMotionArgs,
} from "../../../tooling/src/motion-audit/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A collected run with EVERYTHING present, so each gap test plants exactly one absence. */
function auditData(over: Partial<AuditData> = {}): AuditData {
  return {
    motion: { loafs: [], cls: 0, virtualizedCls: 0, nonVirtualizedCls: 0, worstBlocking: 0, worstShift: 0 },
    animations: [],
    frames: { raw: { total: 12, dropped: 0, pct: 0 }, classified: { total: 0, dropped: 0 }, budgeted: { total: 12, dropped: 0, pct: 0 } },
    pageErrors: [],
    traceEventCount: 900,
    stepFailed: false,
    reachFailures: 0,
    ...over,
  };
}

/** The in-page snapshot fields the verdict reads. Typed off the probe's own parameter so the fixture can
 *  never drift from the shape `clsTotals` actually parses (a probe the reader can't read is a lying proof). */
type Snapshot = NonNullable<Parameters<typeof clsTotals>[0]>;
const FRAME_REPORTER_KEY = "frame_reporter";
const AFFECTS_SMOOTHNESS_KEY = "affects_smoothness";

function snapshot(over: Pick<Snapshot, "cls" | "virtualizedCls" | "nonVirtualizedCls">): Snapshot {
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

test("a purely virtualized journey moves the RAW total and never the verdict", () => {
  // The measured shape: 0.26 of instability, all of it virtual-row reconciliation.
  const motion = snapshot({ cls: 0.26, virtualizedCls: 0.26, nonVirtualizedCls: 0 });
  expect(clsTotals(motion)).toEqual({ raw: 0.26, virtualized: 0.26, budgeted: 0 });
  expect(clsOverBudget(motion)).toBe(false);
});

test("a real app shift still fails the budget even when virtualized settling dwarfs it", () => {
  // The regression this must not become: excluding virtualized shifts must not excuse a real one.
  const motion = snapshot({ cls: 0.41, virtualizedCls: 0.26, nonVirtualizedCls: 0.15 });
  expect(clsOverBudget(motion)).toBe(true);
  expect(clsTotals(motion).raw).toBe(0.41);
});

test("the non-virtualized total is judged against the same 0.1 CWV ceiling as before", () => {
  expect(clsOverBudget(snapshot({ cls: 0.1, virtualizedCls: 0, nonVirtualizedCls: 0.1 }))).toBe(false);
  expect(clsOverBudget(snapshot({ cls: 0.11, virtualizedCls: 0, nonVirtualizedCls: 0.11 }))).toBe(true);
});

test("a page bundle predating the split (no virtualized fields) keeps the OLD verdict, never a free pass", () => {
  // `--isolated --ref <old sha>` legitimately answers from a page without the three-way split. Reading
  // that as "nothing was virtualized" reproduces the pre-#109 behaviour; reading it as 0 would be a lie.
  const legacy = snapshot({ cls: 0.26 });
  expect(clsTotals(legacy)).toEqual({ raw: 0.26, virtualized: 0, budgeted: 0.26 });
  expect(clsOverBudget(legacy)).toBe(true);
});

test("no snapshot at all (no __orb bridge) is zeros, not NaN — and those zeros are NOT a verdict", () => {
  // The totals stay total (a reader that NaNs is worse), but #409 moved the consequence: the run that
  // produced no snapshot is an INSTRUMENT ERROR at the verdict seam, never a clean CLS of 0.
  expect(clsTotals(null)).toEqual({ raw: 0, virtualized: 0, budgeted: 0 });
  expect(clsOverBudget(null)).toBe(false);
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

// ── The REACH queue (issue #148 item 1) ─────────────────────────────────────────────────────────────
// The probe could only click, so any surface behind a room was structurally unauditable. The queue reaches;
// `--selector` still measures.

test("nav and click flags queue in TRUE argv order, and --selector stays the measured interaction", () => {
  const args = parseMotionArgs(["/", "--open-chat", "latest", "--context-tab", "rpg.game", "--click", "[data-slot=more]", "--selector", "[data-slot=toggle]"]);

  expect(args.errors).toEqual([]);
  expect(args.reach).toEqual([
    { kind: "nav", method: "open-chat", target: "latest" },
    { kind: "nav", method: "context-tab", target: "rpg.game" },
    { kind: "click", selector: "[data-slot=more]" },
  ]);
  expect(args.selector).toBe("[data-slot=toggle]");
});

test("a typo'd nav flag is CLI misuse, never a silent audit of the landing page", () => {
  // The whole reason the strict scan exists: `--open-caht` used to print "(ignored)" and return a
  // smoothness verdict for home under the name of the room the caller asked for.
  // The unknown flag's orphaned VALUE then reads as a second route — same cascade design-audit's scan
  // produces, and both lines are true.
  expect(parseMotionArgs(["/", "--open-caht", "latest"]).errors).toEqual(["unknown flag --open-caht", "expected at most one route, got 2"]);
  expect(parseMotionArgs(["/", "--context-tab", "--selector", "x"]).errors).toEqual(["--context-tab requires a value"]);
  expect(parseMotionArgs(["/", "/second"]).errors).toEqual(["expected at most one route, got 2"]);
});

test("a bare run still has an empty reach queue — entry motion stays the default subject", () => {
  const args = parseMotionArgs(["/"]);
  expect(args.errors).toEqual([]);
  expect(args.reach).toEqual([]);
  expect(args.route).toBe("/");
});

test("viewport and measurement-window argv reject malformed values", () => {
  expect(parseMotionArgs(["/", "--viewport", "1280x800x2"]).errors).toContain("--viewport requires WIDTHxHEIGHT positive integers");
  expect(parseMotionArgs(["/", "--viewport", "1e3x800"]).errors).toContain("--viewport requires WIDTHxHEIGHT positive integers");
  for (const raw of ["-1", "0", "Infinity", "nope"]) {
    expect(parseMotionArgs(["/", "--window", raw]).errors).toContain("--window requires a positive finite duration in milliseconds");
  }
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
