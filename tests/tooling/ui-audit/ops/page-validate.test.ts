// The fact-walk and shell-bridge PAGE→NODE seams refuse loudly (#1004). Each malformed payload below is a
// shape the walker string can actually produce — a segment renamed a key, a segment returned a scalar,
// the bridge answered with a stale object — and every one of them used to travel through
// `as RawSamples` / `as ShellStateSnapshot | null` untouched, surfacing (measured) either as an opaque
// TypeError blamed on an innocent file or, for an optional family and any wrong-KIND value, as nothing
// at all: a rule with no samples files no findings and the run reads clean.
//
// The fixture below is deliberately HAND-WRITTEN rather than derived from the validator's own field table:
// a fixture built from the table could never disagree with it, which is the vacuous-pass shape. A new
// REQUIRED field in `RawSamples` reds here (the fixture stops being valid) and in tsc (the table is a
// `Record<keyof RawSamples, …>`) — the two guards are independent on purpose.
import { describe } from "vitest";
import { appFailureSurface, rawSamples, shellStateSnapshot } from "../../../../tooling/src/ui-audit/ops/page-validate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Every REQUIRED field of the walk's return object, at its container kind and nothing more. */
function validSamples(): Record<string, unknown> {
  const arrays = [
    "accentBorders",
    "accessibleNames",
    "animatedImgHovers",
    "bgPatterns",
    "brokenImages",
    "clippedOverflows",
    "edgeFlushCards",
    "gradientTexts",
    "headings",
    "iconTiles",
    "images",
    "motionStatics",
    "nestedCards",
    "overflows",
    "radialGlows",
    "repeatedTexts",
    "shadowGlows",
    "tabIndexes",
    "tapTargets",
    "textStyles",
    "texts",
    "zIndexes",
  ];
  return {
    ...Object.fromEntries(arrays.map((key) => [key, []])),
    censusCaps: {},
    documentFrame: {},
    fontCensus: {},
    mainLandmarkPresent: true,
    pointerCoarse: false,
    subjectAccounting: { observed: 1, settled: 1, stabilized: true },
    themeRender: {},
  };
}

describe("the in-page fact walk's seam", () => {
  test("a complete payload passes, and the optional families may be absent", () => {
    expect(() => rawSamples(validSamples())).not.toThrow();
  });

  test("a MISSING sample family is an INSTRUMENT ERROR, never a family that censused nothing", () => {
    const { texts, ...withoutTexts } = validSamples();
    expect(texts).toBeDefined();
    expect(() => rawSamples(withoutTexts)).toThrow(/INSTRUMENT ERROR.*"texts".*not an array/u);
  });

  test("a family that came back as a scalar is named, with what it actually was", () => {
    expect(() => rawSamples({ ...validSamples(), tapTargets: 0 })).toThrow(/INSTRUMENT ERROR.*"tapTargets".*not an array/u);
  });

  test("a missing DENOMINATOR is refused — the accounting is what every population is judged against", () => {
    const { subjectAccounting, ...withoutAccounting } = validSamples();
    expect(subjectAccounting).toBeDefined();
    expect(() => rawSamples(withoutAccounting)).toThrow(/INSTRUMENT ERROR.*"subjectAccounting".*not a object/u);
  });

  test("an optional family PRESENT at the wrong kind is still refused", () => {
    expect(() => rawSamples({ ...validSamples(), tierDrifts: "none" })).toThrow(/INSTRUMENT ERROR.*"tierDrifts".*not an array/u);
    expect(() => rawSamples({ ...validSamples(), tierDrifts: undefined })).not.toThrow();
  });

  test("the walk returning something that is not an object at all is refused", () => {
    expect(() => rawSamples(null)).toThrow(/INSTRUMENT ERROR.*returned null, not a sample object/u);
    expect(() => rawSamples("[]")).toThrow(/INSTRUMENT ERROR.*returned string, not a sample object/u);
    expect(() => rawSamples([])).toThrow(/INSTRUMENT ERROR.*returned an array, not a sample object/u);
  });
});

describe("the __orb.shell() bridge seam", () => {
  const shell = { section: "home", panels: [{ side: "left", mode: "docked", available: true }], chatOpen: true, focus: false };

  test("null is a REAL answer (no bridge on the page) and passes through", () => {
    expect(shellStateSnapshot(null)).toBeNull();
    expect(shellStateSnapshot(undefined)).toBeNull();
  });

  test("a complete snapshot passes", () => {
    expect(shellStateSnapshot(shell)).toBe(shell);
    expect(shellStateSnapshot({ ...shell, section: null })).not.toBeNull();
  });

  test("a malformed snapshot is refused rather than degrading the panel-axis declare", () => {
    expect(() => shellStateSnapshot({ ...shell, chatOpen: "yes" })).toThrow(/INSTRUMENT ERROR.*"chatOpen"/u);
    expect(() => shellStateSnapshot({ ...shell, section: 3 })).toThrow(/INSTRUMENT ERROR.*"section"/u);
    expect(() => shellStateSnapshot({ ...shell, panels: {} })).toThrow(/INSTRUMENT ERROR.*"panels"/u);
    expect(() => shellStateSnapshot({ ...shell, panels: ["left"] })).toThrow(/INSTRUMENT ERROR.*panel row/u);
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: 1, mode: "docked", available: true }] })).toThrow(/INSTRUMENT ERROR.*side\/mode/u);
  });

  // #1122 · THE DECLARATION IS REQUIRED, AND ITS ABSENCE IS A LOUD REFUSAL, NEVER A DEFAULT. `available`
  // is the only thing that lets the surface-axis census say EXCLUDED instead of WITHHELD on a pane the
  // active section structurally does not have, so a build that does not publish `data-panel-available`
  // (panel-chrome.tsx) must STOP the run at exit-2 rather than silently fall back to the old guess — the
  // "clean zero" arm the fix contract bans. `null` is the same class as absent: the pane rendered and
  // declared nothing about itself.
  test("a panel row with NO available declaration REFUSES loudly — a build that does not publish it is not a verdict", () => {
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: "left", mode: "docked" }] })).toThrow(/INSTRUMENT ERROR.*"available" declaration/u);
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: "left", mode: "docked", available: null }] })).toThrow(
      /INSTRUMENT ERROR.*"available" declaration/u,
    );
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: "left", mode: "docked", available: "true" }] })).toThrow(
      /INSTRUMENT ERROR.*"available" declaration/u,
    );
    // …and the refusal NAMES the side it read, so a half-published shell says WHICH pane broke.
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: "context", mode: "collapsed" }] })).toThrow(/side=context/u);
  });

  // The positive control for the refusal above: a row that DOES declare passes, in both polarities.
  test("both declared polarities pass — the refusal is about an ABSENT declaration, not about `false`", () => {
    expect(shellStateSnapshot({ ...shell, panels: [{ side: "left", mode: "collapsed", available: false }] })).not.toBeNull();
    expect(shellStateSnapshot({ ...shell, panels: [{ side: "left", mode: "docked", available: true }] })).not.toBeNull();
  });
});

describe("the [data-app-failure] declare seam (#1081)", () => {
  test("an absent declare is the healthy case and reads as null, never as a throw", () => {
    expect(appFailureSurface(null)).toBeNull();
    expect(appFailureSurface(undefined)).toBeNull();
  });

  test("a declared kind passes through VERBATIM — including one this instrument has never heard of", () => {
    expect(appFailureSurface("not-found")).toBe("not-found");
    expect(appFailureSurface("crashed")).toBe("crashed");
    // No allow-list: an unknown kind is still the app saying "this is not a surface", and printing the word
    // it used beats folding it into a verdict because the reader did not recognise it.
    expect(appFailureSurface("some-future-boundary")).toBe("some-future-boundary");
  });

  test("a non-string answer is an INSTRUMENT ERROR, never a quiet 'no failure'", () => {
    expect(() => appFailureSurface(0)).toThrow(/INSTRUMENT ERROR.*not a failure-surface kind/u);
    expect(() => appFailureSurface({})).toThrow(/INSTRUMENT ERROR.*not a failure-surface kind/u);
    expect(() => appFailureSurface(["not-found"])).toThrow(/INSTRUMENT ERROR.*not a failure-surface kind/u);
  });
});
