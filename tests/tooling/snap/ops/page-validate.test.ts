// snap's page→node seams refuse loudly (#1004). One test per converted seam, each asserting the arm
// that used to be SILENT rather than merely the obviously-broken one.
import { describe } from "vitest";
import {
  animationEvidence,
  checkpointReset,
  contrastFacts,
  deadCssCensus,
  deadCssDrain,
  devToolsDiscoveryProof,
  perfEvidence,
  rawMapEntries,
  resetFailures,
} from "../../../../tooling/src/snap/ops/page-validate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A COMPLETE measured arm — every field `contrastFacts` declares it will refuse without. Kept in field
 *  order with the reader (`tooling/src/snap/ops/page-validate.ts`) so a new required field shows up here as
 *  a gap rather than as a mystery throw: `hasIconInk` and `radii` were added to the read at 881c70701
 *  (#1111) and this fixture was not swept, so the arm this test exists to prove PASSES was throwing the
 *  refusal the arm below exists to prove it throws (#1246). The two fields are the ICON-INK and SHAPE
 *  channels of #1111's fill arm — an `<svg>` subtree paints with `currentColor`, and a background is
 *  clipped to the rounded border box — so a fixture without them is not a measured subject at all. */
const MEASURED = {
  color: "rgb(1, 2, 3)",
  fontSizePx: 16,
  fontWeight: 400,
  backdrop: { kind: "flat", color: "rgb(255, 255, 255)" },
  hasText: true,
  hasIconInk: false,
  // #2429 item 2's channel: whether `color` is the ::placeholder ink of an EMPTY field. A field is the
  // one subject whose ink depends on its VALUE, so a fixture without this field is not a measured subject
  // either — and the swept-fixture failure this header describes is exactly what it produced here.
  placeholderInk: false,
  radii: { tl: 0, tr: 0, br: 0, bl: 0 },
  inactive: false,
  role: "",
  tag: "P",
  foregroundOpacity: 1,
  box: { x: 0, y: 0, width: 10, height: 10 },
  matchIndex: 0,
  total: 1,
};

describe("the --contrast facts", () => {
  test("null is a real answer, and all three non-null arms pass", () => {
    expect(contrastFacts(null)).toBeNull();
    expect(contrastFacts({ offscreen: true, total: 3 })).toMatchObject({ offscreen: true });
    expect(contrastFacts({ occluded: true, total: 3, inViewport: 1, occluder: null })).toMatchObject({ occluded: true });
    expect(contrastFacts(MEASURED)).toMatchObject({ color: "rgb(1, 2, 3)" });
  });

  test("THE SILENT ARM: an object matching no arm fell through to MEASURED and minted a verdict from undefined", () => {
    expect(() => contrastFacts({ offscreen: false })).toThrow(/INSTRUMENT ERROR.*field "backdrop" returned nothing/u);
    expect(() => contrastFacts({})).toThrow(/field "backdrop"/u);
  });

  test("a measured arm missing its geometry or its dimming factor is refused", () => {
    const { box, ...withoutBox } = MEASURED;
    expect(box).toBeDefined();
    expect(() => contrastFacts(withoutBox)).toThrow(/field "box" returned nothing/u);
    expect(() => contrastFacts({ ...MEASURED, foregroundOpacity: "1" })).toThrow(/field "foregroundOpacity" returned string/u);
  });

  test("an offscreen/occluded arm without its population count is refused", () => {
    expect(() => contrastFacts({ offscreen: true })).toThrow(/field "total" returned nothing/u);
    expect(() => contrastFacts({ occluded: true, total: 2 })).toThrow(/field "inViewport" returned nothing/u);
  });
});

describe("the --map rows", () => {
  const row = {
    role: "button",
    name: "Save",
    selector: "#a",
    fallback: "#a",
    semanticFallback: "#a",
    state: { disabled: false, current: null, checked: null, expanded: null },
    visibility: "visible",
    inactiveReason: null,
    actionability: "actionable",
  };

  test("null (no match) passes through, and a well-formed list passes", () => {
    expect(rawMapEntries(null)).toBeNull();
    expect(rawMapEntries([row])).toHaveLength(1);
  });

  test("a malformed row is named HERE, not inside the per-row selector walk three functions later", () => {
    expect(() => rawMapEntries([row, { ...row, selector: 7 }])).toThrow(/row 1 field "selector" returned number/u);
    expect(() => rawMapEntries([null])).toThrow(/row 0 returned null, not an object/u);
    expect(() => rawMapEntries({ entries: [] })).toThrow(/the map read returned object, not a list/u);
  });
});

describe("the dead-css reads", () => {
  const census = { sheets: 1, readableSheets: 1, rules: 10, defined: 5, used: 5, unreadable: [], dead: [], empty: [] };

  test("the drain keeps null (a --file fixture has no bridge) distinguishable from unreadable", () => {
    expect(deadCssDrain(null)).toBeNull();
    expect(deadCssDrain({ requestedGeneration: 1, completedGeneration: 1 })).toMatchObject({ requestedGeneration: 1 });
    expect(() => deadCssDrain({ requestedGeneration: 1 })).toThrow(/field "completedGeneration" returned nothing/u);
  });

  test("every census number is checked — each one is printed as evidence and compared to a budget", () => {
    expect(deadCssCensus(census)).toMatchObject({ rules: 10 });
    expect(() => deadCssCensus({ ...census, rules: undefined })).toThrow(/field "rules" returned nothing/u);
    expect(() => deadCssCensus({ ...census, dead: {} })).toThrow(/field "dead" returned object, not a list/u);
  });
});

describe("the perf evidence read", () => {
  test("a null navigation entry is legal; a malformed one is refused before it lands in the report", () => {
    expect(perfEvidence({ navigation: null, orb: null })).toMatchObject({ navigation: null });
    expect(perfEvidence({ navigation: { domContentLoadedMs: 1, loadMs: 2, responseMs: 3 }, orb: null })).toBeTruthy();
    expect(() => perfEvidence({ navigation: { domContentLoadedMs: 1, loadMs: 2 }, orb: null })).toThrow(/"responseMs" returned nothing/u);
    expect(() => perfEvidence("{}")).toThrow(/not an object/u);
  });
});

describe("the DevTools discovery proof", () => {
  const proof = { inspectedUrl: "about:blank", fixture: true, rows: [1, 2] };

  test("a complete proof passes; a malformed one no longer satisfies the checks by undefined comparison", () => {
    expect(devToolsDiscoveryProof(proof)).toEqual(proof);
    expect(() => devToolsDiscoveryProof({ ...proof, fixture: "true" })).toThrow(/field "fixture" returned string/u);
    expect(() => devToolsDiscoveryProof({ inspectedUrl: "about:blank", fixture: true })).toThrow(/field "rows" returned nothing/u);
  });
});

describe("the appearance-invariant row preconditions", () => {
  test("the checkpoint reset keeps FALSE meaningful and refuses a truthy non-boolean", () => {
    expect(checkpointReset(true)).toBe(true);
    expect(checkpointReset(false)).toBe(false);
    expect(() => checkpointReset("ok")).toThrow(/not a boolean/u);
  });

  test("the ring-reset failures must be a list of strings", () => {
    expect(resetFailures([])).toEqual([]);
    expect(resetFailures(["motion"])).toEqual(["motion"]);
    expect(() => resetFailures(null)).toThrow(/returned null, not a list/u);
    expect(() => resetFailures([{ name: "motion" }])).toThrow(/row 0 returned object, not a string/u);
  });

  test("the animation evidence keeps null (no bridge) and refuses a malformed census", () => {
    expect(animationEvidence(null)).toBeNull();
    expect(animationEvidence({ total: 2, dirty: 1, properties: ["opacity"] })).toEqual({ total: 2, dirty: 1, properties: ["opacity"] });
    expect(() => animationEvidence({ total: 2, dirty: 1 })).toThrow(/field "properties" returned nothing/u);
    expect(() => animationEvidence({ total: "2", dirty: 1, properties: [] })).toThrow(/field "total" returned string/u);
    expect(() => animationEvidence({ total: 1, dirty: 0, properties: [7] })).toThrow(/property 0 returned number/u);
  });
});
