// The evidence gaps that turn a design-audit run into an INSTRUMENT failure instead of a verdict
// (tooling/src/ui-audit/lib/evidence.ts). The census and reach arms are exercised end-to-end in
// tests/tooling/ui-audit/index.int.test.ts; this file pins the READINESS arm's pure verdict, whose whole job
// is to be true when the two count-based arms cannot see the problem.

import type { SettingsShimEvidence } from "../../../../tooling/src/_shared/appearance.ts";
import { instrumentPageError, pageErrorText, runtimePageError } from "../../../../tooling/src/_shared/browser-contract.ts";
import type { RowVoidInput } from "../../../../tooling/src/ui-audit/contract/samples-layout.ts";
import type { TierDriftInput } from "../../../../tooling/src/ui-audit/contract/samples-populations.ts";
import type { DomPopulation, RawSamples, ThemeRenderInput } from "../../../../tooling/src/ui-audit/index.ts";
import { censusThinGap, censusTotal, instrumentPageErrorGap, readinessGap, themeProvenanceGap } from "../../../../tooling/src/ui-audit/index.ts";
import { checkScriptErrors } from "../../../../tooling/src/ui-audit/lib/checks-quality.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function population(duringWalk: number, settled: number, stabilized = true): DomPopulation {
  const documentHead = Math.min(2, duringWalk);
  return {
    duringWalk,
    settled,
    stabilized,
    accounting: {
      observed: settled,
      settled: duringWalk,
      stabilized,
      settleMutations: 0,
      walked: duringWalk - documentHead,
      renderedSubjects: duringWalk - documentHead,
      retainedHiddenSubjects: 0,
      skipped: { documentHead, devChrome: 0 },
      inaccessible: 0,
      final: duringWalk,
      added: 0,
      detached: 0,
      walkMutations: 0,
    },
  };
}

// @instrument-absence-proof: an app origin whose app never mounted censuses the SHELL — measured on the
// #678 stage receipt: 14 nodes, 1 reachable control, `findings=0`, exit 0, over a planted 1:1 contrast
// defect the same command REDed on at census 332 once the app was up. 14 and 1 are not zero, so censusGap
// and reachGap both pass it through; the readiness signal is the only discriminator.
test("an app origin that never published data-app-ready is a gap, and it NAMES the signal", () => {
  const gap = readinessGap("http://localhost:5273/", false);
  expect(gap?.evidence).toContain("readiness");
  expect(gap?.detail, "the operator needs the remedy, not just the diagnosis").toContain("re-run");
});

test("a ready app origin is no gap — the fence does not refuse every run", () => {
  expect(readinessGap("http://localhost:5273/", true)).toBeNull();
});

test("a file:// fixture is exempt — no app is expected to mount there", () => {
  // The audit's own suite drives file:// pages that declare readiness themselves; a mock or a static
  // export legitimately has no app at all, and refusing those would delete a supported mode.
  expect(readinessGap("file:///tmp/scratch/good.html", false)).toBeNull();
});

// ── the THIN-CENSUS arm (#808) — the fraction the three zero-arms cannot express ──────────────────

// @instrument-absence-proof: MEASURED 2026-08-29 on Settings → Plugins at 1280x2200 —
// `census=22 reached=3 findings=2 nav=OK` printed as a verdict; the identical next run censused 1421 and
// reached 126. readinessGap passes (the app HAD published data-app-ready — it is one-shot at boot, so a
// surface reached by an --actions click inherits the previous surface's settle), censusGap passes (22 ≠ 0)
// and reachGap passes (3 ≠ 0). Only the population delta names it.
test("a page that kept growing after the walk is a gap, and it NAMES both numbers", () => {
  const gap = censusThinGap(population(34, 1421));
  expect(gap?.evidence).toContain("completeness");
  expect(gap?.detail).toContain("34");
  expect(gap?.detail).toContain("1421");
  expect(gap?.detail, "the operator needs the remedy, not just the diagnosis").toContain("Re-run");
});

// @instrument-absence-proof: #976's live Light-theme receipt was 285 at the judged walk and 381 once the
// real settings/theme reads finished. The old 1.5x tolerance returned null because 381/285 = 1.337, even
// though 96 final subjects were never judged. Exact accounting cannot have an "incidental" missing class.
test("the reproduced 285/381 Light-theme omission is an evidence gap", () => {
  const gap = censusThinGap(population(285, 381));

  expect(gap?.evidence).toContain("completeness");
  expect(gap?.detail).toContain("285");
  expect(gap?.detail).toContain("381");
});

test("a count still moving at the ceiling says its figure is a FLOOR", () => {
  expect(censusThinGap(population(20, 900, false))?.detail).toContain("floor");
});

test("a settled surface is no gap — the fence does not refuse every run", () => {
  expect(censusThinGap(population(1421, 1421))).toBeNull();
});

test("even a small unexplained late mount is a gap — every settled subject needs an accounting class", () => {
  expect(censusThinGap(population(1400, 1456))).not.toBeNull();
  expect(censusThinGap(population(6, 12))).not.toBeNull();
});

test("an unexplained shrink is a gap too — detachment can invalidate selectors and rendered facts", () => {
  expect(censusThinGap(population(900, 400))).not.toBeNull();
});

test("no population reading at all is no gap — a nav error reports as itself", () => {
  expect(censusThinGap(null)).toBeNull();
});

const LIGHT_RENDER: ThemeRenderInput = {
  rootDataTheme: "light",
  shellScope: { present: true, inlineBackground: null, colorScheme: "light" },
  subjectSources: { default: 2, seed: 98, custom: 0, unknown: 0 },
  subjectPolarities: { light: 100, dark: 0, mixed: 0, unknown: 0 },
};
const LIGHT_SHIM: SettingsShimEvidence = {
  appearanceApplied: null,
  themeApplied: true,
  themeResolution: { request: "Light", id: "theme_light", name: "Light", source: "seed" },
  themeCatalog: [],
  backgroundLibraryFirst: null,
};

test("requested, catalog-resolved, rendered Light with whole-subject polarity is proven", () => {
  expect(themeProvenanceGap("Light", LIGHT_SHIM, LIGHT_RENDER, 100)).toBeNull();
});

test("a planted requested-vs-rendered mismatch is a provenance gap", () => {
  const mochaRender = { ...LIGHT_RENDER, rootDataTheme: "mocha" };
  const gap = themeProvenanceGap("Light", LIGHT_SHIM, mochaRender, 100);

  expect(gap?.evidence).toContain("provenance");
  expect(gap?.detail).toContain("Light");
  expect(gap?.detail).toContain("mocha");
});

// ── THE CENSUS TOTAL (#25) — the denominator the censusGap refusal reads ─────────────────────────

/** A walk that collected NOTHING, in any family. `censusTotal` over this must be 0: that is the
 *  blank-mount / swallowed-error-boundary shape the refusal exists for, and no widening of the count
 *  may soften it. */
const NOTHING_WALKED: RawSamples = {
  censusCaps: {},
  subjectAccounting: {
    observed: 3,
    settled: 3,
    stabilized: true,
    settleMutations: 0,
    walked: 1,
    renderedSubjects: 1,
    retainedHiddenSubjects: 0,
    skipped: { documentHead: 2, devChrome: 0 },
    inaccessible: 0,
    final: 3,
    added: 0,
    detached: 0,
    walkMutations: 0,
  },
  themeRender: {
    rootDataTheme: null,
    shellScope: { present: false, inlineBackground: null, colorScheme: null },
    subjectSources: { default: 1, seed: 0, custom: 0, unknown: 0 },
    subjectPolarities: { light: 0, dark: 1, mixed: 0, unknown: 0 },
  },
  texts: [],
  images: [],
  tapTargets: [],
  accessibleNames: [],
  mainLandmarkPresent: true,
  tabIndexes: [],
  zIndexes: [],
  nestedCards: [],
  gradientTexts: [],
  animatedImgHovers: [],
  pointerCoarse: false,
  textStyles: [],
  accentBorders: [],
  shadowGlows: [],
  radialGlows: [],
  bgPatterns: [],
  iconTiles: [],
  motionStatics: [],
  fontCensus: { faces: [], probeUsable: true, sizes: [] },
  brokenImages: [],
  headings: [],
  overflows: [],
  repeatedTexts: [],
  clippedOverflows: [],
  edgeFlushCards: [],
};

/** One density-tier resolution the walker really read and judged — a RELATIONAL sample, carrying no
 *  text, no image and no control. A fixture built to exercise a relational rule produces exactly this
 *  and nothing else. */
const TIER_DRIFT: TierDriftInput = {
  selector: "div[data-slot=card-root]",
  tier: "instrument",
  slot: "card-root",
  property: "padding-top",
  varName: "--orb-tier-island-pad",
  unit: "px",
  sanctionedRaw: "8px",
  paintedRaw: "20px",
  sanctionedValue: 8,
  paintedValue: 20,
};

const ROW_VOID: RowVoidInput = {
  selector: "div[data-slot=row]",
  gapPx: 300,
  rowWidthPx: 600,
  gapRatio: 0.5,
  leftSelector: "span",
  leftText: "label",
  leftWidthPx: 40,
  rightSelector: "button",
  rightWidthPx: 60,
};

// @instrument-absence-proof: the polarity error INSIDE the refusal path (#25). A geometry+CSS fixture
// built for a RELATIONAL rule leaves every counted family empty while the walker legitimately saw and
// judged elements — the run then refused with `censusGap` ("the walk censused 0 nodes"), which to an
// operator and to a harness reading the (never-written) report is indistinguishable from a walker
// crash. A censused relational sample is a censused node.
test("a relational-only walk is CENSUSED, not zero — a geometry fixture is not a blank mount", () => {
  expect(censusTotal({ ...NOTHING_WALKED, tierDrifts: [TIER_DRIFT] })).toBeGreaterThan(0);
});

test("every relational family counts, and each sample counts once", () => {
  expect(censusTotal({ ...NOTHING_WALKED, rowVoids: [ROW_VOID] })).toBeGreaterThan(0);
  expect(censusTotal({ ...NOTHING_WALKED, tierDrifts: [TIER_DRIFT], rowVoids: [ROW_VOID] })).toBe(2);
});

// The protection this may not weaken (#409/#678/#976): a walk that saw nothing in ANY family — counted
// or relational — is still a zero census, and a zero census is still an instrument failure.
test("a walk that collected nothing in ANY family is still zero — the refusal keeps its teeth", () => {
  expect(censusTotal(NOTHING_WALKED)).toBe(0);
});

// A REGRESSION FENCE, honestly labelled (#1317 item 6): the flat half of `censusTotal` moved from a
// hand-written sum to a mapped-type Record whose enforcement is tsc (a family added to `RawSamples`
// without a counted/not-counted classification REDs the compiler). That enforcement is not runtime-
// observable, so these two arms pin only that the MEANING did not move with the shape: a SUBJECT census
// counts, a DETECTOR family does not — the second is the arithmetic that would double-count a node the
// text census already counted and quietly inflate the one denominator a `findings=0` verdict rests on.
test("the census denominator counts subject families and not detector families", () => {
  const oneText = { ...NOTHING_WALKED, headings: [{ selector: "main h1", level: 1, text: "Library" }] };
  expect(censusTotal(oneText)).toBe(1);
  expect(censusTotal({ ...oneText, shadowGlows: [{ selector: "div", boxShadow: "0 0 8px red", textShadow: "none", backdropColor: null }] })).toBe(1);
});

// @instrument-absence-proof: THE INSTRUMENT BLAMING THE APP (#1317 item 1). `session.pageErrors` carries
// two kinds and ops/run.ts used to flatten both through `pageErrorText` into `checkScriptErrors`, so a
// FAILURE OF THIS HARNESS ("browser diagnostic setup failed: …", pushed by _shared/browser-capture.ts
// from a wire-up promise with no awaiter) was filed as a `script-error` P0 DEFECT OF THE PAGE and exited
// 1. The first arm is the receipt that the old flattening really did mint an app finding out of an
// instrument failure; the second is the polarity that replaces it — exit-2 class, no finding.
test("an instrument-origin page error is a NO VERDICT, never a script-error finding", () => {
  const instrument = instrumentPageError("browser diagnostic setup failed: CDP detached");
  const runtime = runtimePageError(Object.assign(new Error("boom"), { name: "TypeError" }));

  // the receipt: text-flattened, an instrument failure is indistinguishable from an app crash
  expect(checkScriptErrors([instrument, runtime].map(pageErrorText))).toHaveLength(2);

  // the polarity: split by kind, only the RUNTIME error is the page's fault …
  const findings = checkScriptErrors([instrument, runtime].filter((error) => error.kind === "runtime").map(pageErrorText));
  expect(findings).toHaveLength(1);
  expect(findings[0]?.rule).toBe("script-error");

  // … and the instrument half is a gap, which ops/run.ts renders as EXIT.toolError
  const gap = instrumentPageErrorGap([instrument].map(pageErrorText));
  expect(gap?.evidence).toBe("the browser capture harness");
  expect(gap?.detail).toContain("NO VERDICT");
  expect(instrumentPageErrorGap([])).toBeNull();
});

test("unknown catalog source and unknown subject polarity are never inferred", () => {
  const unknownShim: SettingsShimEvidence = {
    ...LIGHT_SHIM,
    themeResolution: { request: "Light", id: "theme_light", name: "Light", source: "unknown" },
  };
  const unknownRender: ThemeRenderInput = {
    ...LIGHT_RENDER,
    subjectPolarities: { light: 99, dark: 0, mixed: 0, unknown: 1 },
  };
  expect(themeProvenanceGap("Light", unknownShim, unknownRender, 100)?.detail).toContain("unknown");
});
