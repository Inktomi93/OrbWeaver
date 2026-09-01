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
import { rawSamples, shellStateSnapshot } from "../../../../tooling/src/ui-audit/ops/page-validate.ts";
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
  const shell = { section: "home", panels: [{ side: "left", mode: "docked" }], chatOpen: true, focus: false };

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
    expect(() => shellStateSnapshot({ ...shell, panels: [{ side: 1, mode: "docked" }] })).toThrow(/INSTRUMENT ERROR.*side\/mode/u);
  });
});
