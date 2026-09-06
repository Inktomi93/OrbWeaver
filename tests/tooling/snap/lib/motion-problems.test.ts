// @instrument-proof: an excused style/layout frame is NAMED in the verdict, not silently folded into a
//   clean `loaf-style-layout-count 0`. A reader who cannot tell "excused under a bounded carve-out" from
//   "never did any layout work" has been handed a stronger clean than the run earned (#1780).
// @instrument-absence-proof: a frame that does NOT meet the carve-out produces NO exemption row and the
//   ordinary failing row — the planted control in the other direction, in this same file.
//
// WHY THE EXEMPTION IS NOT EXTRA TEXT ON THE FAILING ROW: condition (d) of the carve-out
// (`motion-audit/lib/verdicts.ts`) requires the excused frame to be the ONLY one in the window performing
// style/layout, so the moment it is excused `budgetedStyleLayout` is 0 and the failing row cannot exist.
// The two rows are mutually exclusive by construction, which is why `exemption` is its own non-failing
// kind rather than a sentence appended to a `threshold` row.
import type { AuditData, BrowserEnvironmentEvidence, MotionSnapshot } from "../../../../tooling/src/motion-audit/index.ts";
import { motionProblems } from "../../../../tooling/src/snap/lib/motion-problems.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ENVIRONMENT: BrowserEnvironmentEvidence = {
  requested: { device: null, viewport: { width: 1280, height: 800 }, colorScheme: null, reducedMotion: false, contrast: null, reducedTransparency: false },
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

type Loaf = MotionSnapshot["loafs"][number];

/** The one shape the carve-out accepts: a single layout-bearing frame whose only script IS React's
 *  discrete-event dispatch, forcing nothing, with style/layout at the tail of the script span. */
function boundedDispatchLoaf(over: Partial<Loaf> = {}): Loaf {
  return {
    startTime: 0,
    duration: 22,
    blockingDuration: 0,
    styleAndLayoutStart: 22,
    scripts: [
      {
        sourceURL: "http://127.0.0.1:5173/@fs/react-dom_client.js",
        duration: 22,
        forcedStyleAndLayoutDuration: 0,
        sourceFunctionName: "dispatchDiscreteEvent",
      },
    ],
    ...over,
  };
}

function auditData(loafs: readonly Loaf[]): AuditData {
  return {
    environment: ENVIRONMENT,
    applicationMotion: null,
    motion: {
      loafs: [...loafs],
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
    measuredInput: true,
    flags: [],
  };
}

function layoutRows(data: AuditData): readonly { readonly kind: string; readonly observed: string; readonly threshold: string; readonly detail: string }[] {
  return motionProblems(data, []).filter((problem) => problem.metric === "loaf-style-layout-count");
}

test("a bounded input-dispatch layout frame is NAMED as an exemption, with all four conditions", () => {
  const rows = layoutRows(auditData([boundedDispatchLoaf()]));

  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.kind).toBe("exemption");
  expect(row?.threshold).toBe("bounded-input-dispatch-layout-frame");
  expect(row?.observed).toBe("0 budgeted, 1 excused");
  // All four conditions, by their distinguishing fact rather than by their letter, so the pin survives a
  // rewording of the prose around them.
  expect(row?.detail).toContain("ONLY frame in the window performing style/layout");
  expect(row?.detail).toContain("dispatchDiscreteEvent");
  expect(row?.detail).toContain("forcedStyleAndLayoutDuration 0 on every script");
  expect(row?.detail).toContain("at or after the frame's own script span");
  // The recorded PROXY: the row must never claim the spec's own renderStart, which the collector does not
  // plumb. Stating the weaker computed signal is the whole point of naming it here.
  expect(row?.detail).toContain("sum of scripts[].duration");
  expect(row?.detail).toContain("renderStart");
});

// THE CONTROL IN THE OTHER DIRECTION, same file: change one condition and the run must go back to a
// failing threshold row with NO exemption row beside it.
test("a layout frame that does not meet the carve-out prints the failing row and NO exemption", () => {
  const rows = layoutRows(
    auditData([
      boundedDispatchLoaf({
        scripts: [{ sourceURL: "http://127.0.0.1:5173/app.js", duration: 22, forcedStyleAndLayoutDuration: 0, sourceFunctionName: "someOtherWork" }],
      }),
    ]),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("threshold");
  expect(rows[0]?.observed).toBe("1");
  expect(rows[0]?.threshold).toBe("0");
  expect(rows[0]?.detail).not.toContain("bounded-input-dispatch");
});

test("a window with no style/layout at all prints neither row", () => {
  expect(layoutRows(auditData([boundedDispatchLoaf({ styleAndLayoutStart: 0 })]))).toHaveLength(0);
});
