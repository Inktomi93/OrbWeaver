// The RUNG-2 POPULATION PINS (#1027). Every rule the rung table moved off rung 1 owes a TWO-DIRECTION
// receipt here: one planted candidate the rule JUDGES, and one it declines with a NAMED reason — so a
// classifier that quietly stops partitioning (every candidate judged, or every candidate excluded) goes
// red instead of printing a smaller-but-clean-looking denominator, which is the exact false clean the
// #987 population contract exists to end.
//
// These assert the ACCOUNTING only. Emission is pinned by the rule's own firing/silence proofs in
// tests/tooling/ui-audit/index.test.ts, and #1027 changed no threshold, severity or message.

import { readFile } from "node:fs/promises";
import { DESIGN_AUDIT_RULE_IDS } from "../../../../tooling/src/ui-audit/contract/rules.ts";
import type { RawSamples, TextStyleInput } from "../../../../tooling/src/ui-audit/index.ts";
import { collectAudit } from "../../../../tooling/src/ui-audit/lib/collect.ts";

import { expect, test } from "../../../support/tool-fixtures.ts";

const EMPTY_SAMPLES: RawSamples = {
  censusCaps: {},
  // A frame that FITS: these fixtures are about their own family, and a crushed-frame refusal here
  // would be a second, unrelated verdict riding along (contract/samples-evidence.ts DocumentFrameInput).
  documentFrame: { viewportWidth: 800, contentWidth: 800, viewportHeight: 600, contentHeight: 600, tolerancePx: 2, carriers: { total: 0, worst: [] } },
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

function rowsFor(samples: Partial<RawSamples>): ReturnType<typeof collectAudit>["populationAccounting"] {
  return collectAudit({ ...EMPTY_SAMPLES, ...samples }).populationAccounting;
}

// ── a11y ─────────────────────────────────────────────────────────────────────
test("control-aspect partitions a governed role from one it does not govern, and withholds an animating box", () => {
  const rows = rowsFor({
    controlAspects: [
      { selector: "[role=switch]", role: "switch", width: 20, height: 18, animating: false },
      { selector: "[role=button]", role: "button", width: 20, height: 18, animating: false },
      { selector: "[role=switch]:nth-of-type(2)", role: "switch", width: 20, height: 18, animating: true },
    ],
  });
  expect(rows["control-aspect"]).toMatchObject({
    candidates: 3,
    judged: 1,
    affected: 1,
    excluded: { roleWithoutSilhouette: 1 },
    withheld: { animating: 1 },
  });
});

test("aria-name publishes the interactive census it judged, not just the controls that failed", () => {
  const named = {
    selector: "button.a",
    tag: "button",
    hasVisibleText: true,
    ariaLabel: null,
    ariaLabelledbyText: null,
    nativeLabelText: null,
    title: null,
    altText: null,
  };
  const rows = rowsFor({ accessibleNames: [named, { ...named, selector: "button.b", hasVisibleText: false }] });
  expect(rows["aria-name"]).toMatchObject({ candidates: 2, judged: 2, affected: 1, excluded: {}, withheld: {} });
});

test("tabindex-positive publishes every censused tabindex, so a clean row means the census ran", () => {
  const rows = rowsFor({
    tabIndexes: [
      { selector: "a.a", tabIndex: 0 },
      { selector: "a.b", tabIndex: 3 },
    ],
  });
  expect(rows["tabindex-positive"]).toMatchObject({ candidates: 2, judged: 2, affected: 1 });
});

// ── decor ────────────────────────────────────────────────────────────────────
const ACCENT_BASE = {
  selector: "div.card",
  tag: "div",
  widths: { top: 0, right: 0, bottom: 0, left: 4 },
  colors: {
    top: null,
    right: null,
    bottom: null,
    left: { r: 235, g: 110, b: 40, a: 1 },
  },
  radius: 10,
  badgeLike: false,
  tabContext: false,
  statusContext: false,
  selectionRail: false,
  artPane: false,
};

test("both accent-border rules share ONE census and both COUNT every ratified exemption", () => {
  // An exemption is counted, never dropped: widening one has to be visible in the denominator instead of
  // arriving as a quieter clean run. `illustratedPickerArt` (#1642) joins the two #485/#188-era rows.
  const rows = rowsFor({
    accentBorders: [
      ACCENT_BASE,
      { ...ACCENT_BASE, selector: "div.row", selectionRail: true },
      { ...ACCENT_BASE, selector: "div.alert", statusContext: true },
      { ...ACCENT_BASE, selector: "div.skin-diagram", artPane: true },
    ],
  });
  for (const rule of ["side-tab", "border-accent-on-rounded"] as const) {
    expect(rows[rule], rule).toMatchObject({
      candidates: 4,
      judged: 1,
      affected: 1,
      excluded: { ratifiedSelectionRail: 1, statusRegionAccent: 1, illustratedPickerArt: 1 },
    });
  }
});

test("glow-shadow counts the sanctioned carrier, so the exemption's reach is visible rather than silent", () => {
  const rows = rowsFor({
    shadowGlows: [
      { selector: "div.halo", boxShadow: "0px 0px 18px 0px rgba(235,110,40,0.55)", textShadow: "", backdropColor: null },
      { selector: "div.aura::before", boxShadow: "0px 0px 18px 0px rgba(235,110,40,0.55)", textShadow: "", backdropColor: null, sanctioned: true },
    ],
  });
  expect(rows["glow-shadow"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { sanctionedGlowCarrier: 1 } });
});

// ── media ────────────────────────────────────────────────────────────────────
test("distorted-image excludes a deliberate crop instead of counting it as a clean judgment", () => {
  const rows = rowsFor({
    images: [
      { selector: "img.a", naturalWidth: 100, naturalHeight: 100, renderedWidth: 200, renderedHeight: 100, objectFit: "fill" },
      { selector: "img.b", naturalWidth: 100, naturalHeight: 100, renderedWidth: 200, renderedHeight: 100, objectFit: "cover" },
      { selector: "img.c", naturalWidth: 0, naturalHeight: 0, renderedWidth: 0, renderedHeight: 0, objectFit: "fill" },
    ],
  });
  expect(rows["distorted-image"]).toMatchObject({
    candidates: 3,
    judged: 1,
    affected: 1,
    excluded: { objectFitCropsOrLetterboxes: 1, noComparableExtent: 1 },
  });
});

// ── ornament ─────────────────────────────────────────────────────────────────
test("the two radial rules split one census, and each counts the sanctioned carrier", () => {
  const wash = { selector: "div.wash", value: "radial-gradient(circle, rgba(235,110,40,0.7) 0%, transparent 70%)", width: 400, height: 300, sanctioned: false };
  const rows = rowsFor({ radialGlows: [wash, { ...wash, selector: "div.owner", sanctioned: true }] });
  expect(rows["radial-halo"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { sanctionedGlowCarrier: 1 } });
  expect(rows["radial-spotlight-glow"]).toMatchObject({ candidates: 2, judged: 1, affected: 0, excluded: { sanctionedGlowCarrier: 1 } });
});

test("stripe and grid backgrounds are two populations drawn from one sweep, not one census judged twice", () => {
  const rows = rowsFor({
    bgPatterns: [
      { selector: "div.stripes", kind: "stripe", backgroundSize: "auto", width: 400, height: 200 },
      { selector: "div.grid", kind: "grid", backgroundSize: "24px 24px", width: 400, height: 200 },
    ],
  });
  expect(rows["stripe-background"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { otherPatternKind: 1 } });
  expect(rows["grid-line-background"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { otherPatternKind: 1 } });
});

test("icon-tile-stack publishes the heading census it judged, so a clean row is not an absent walker", () => {
  const rows = rowsFor({
    iconTiles: [
      {
        headingTag: "h3",
        headingText: "Feature",
        headingTop: 200,
        siblingSelector: "div.tile",
        siblingWidth: 48,
        siblingHeight: 48,
        siblingBottom: 190,
        siblingBgAlpha: 1,
        siblingHasBgImage: false,
        siblingBorderWidth: 0,
        siblingRadiusPx: 8,
        hasIconChild: true,
        iconChildWidth: 20,
      },
      {
        headingTag: "h3",
        headingText: "Plain",
        headingTop: 400,
        siblingSelector: "p.lede",
        siblingWidth: 600,
        siblingHeight: 20,
        siblingBottom: 390,
        siblingBgAlpha: 0,
        siblingHasBgImage: false,
        siblingBorderWidth: 0,
        siblingRadiusPx: 0,
        hasIconChild: false,
        iconChildWidth: 0,
      },
    ],
  });
  expect(rows["icon-tile-stack"]).toMatchObject({ candidates: 2, judged: 2, affected: 1 });
});

test("the motion rules own disjoint sample kinds, and the motion-law panel carve-out is COUNTED", () => {
  const rows = rowsFor({
    motionStatics: [
      { selector: "div.a", kind: "layout-transition", value: "height", panelExempt: false },
      { selector: "div.b", kind: "layout-transition", value: "height", panelExempt: true },
      { selector: "div.c", kind: "bounce-name", value: "bounce-in", panelExempt: false },
    ],
  });
  expect(rows["layout-transition"]).toMatchObject({ candidates: 3, judged: 1, affected: 1, excluded: { panelExempt: 1, otherMotionKind: 1 } });
  expect(rows["bounce-easing"]).toMatchObject({ candidates: 3, judged: 1, affected: 1, excluded: { otherMotionKind: 2 } });
});

// ── structure ────────────────────────────────────────────────────────────────
test("z-index-escalation publishes the positive-z census it judged", () => {
  const rows = rowsFor({
    zIndexes: [
      { selector: "div.a", zIndex: 10 },
      { selector: "div.b", zIndex: 9999 },
    ],
  });
  expect(rows["z-index-escalation"]).toMatchObject({ candidates: 2, judged: 2, affected: 1 });
});

// ── typography ───────────────────────────────────────────────────────────────
const TEXT_BASE: TextStyleInput = {
  selector: "p.t",
  tag: "p",
  directTextLen: 60,
  totalTextLen: 60,
  fontSizePx: 15,
  lineHeightPx: 23,
  letterSpacingPx: 0,
  textTransform: "none",
  textAlign: "start",
  hyphens: "manual",
  rectWidth: 400,
  chWidthPx: 8,
  // The law-character denominator the prose arm judges in (#1183) — a `ch` is ~1.5 of these, which is why
  // the two live side by side rather than one being derived from the other.
  glyphAdvancePx: 5.3,
  isProseTag: true,
  isHeading: false,
  interactive: false,
  codeContext: false,
  srOnly: false,
};

// Each reason gets its OWN label, and each measure ARM its own withholding (#1183): an unlabelled node and
// an authored chrome voice are different facts about the population, and a blind `ch` advance and a blind
// glyph advance are different facts about the instrument.
test("line-length partitions its whole census — two exclusion labels, and each arm withholds under its own denominator", () => {
  const rows = rowsFor({
    textStyles: [
      { ...TEXT_BASE, totalTextLen: 900, rectWidth: 900 },
      { ...TEXT_BASE, selector: "span.s", isProseTag: false },
      { ...TEXT_BASE, selector: "span.v", isProseTag: false, ownVoice: "kicker" },
      { ...TEXT_BASE, selector: "p.u", totalTextLen: 900, glyphAdvancePx: 0 },
      { ...TEXT_BASE, selector: "p.b", totalTextLen: 900, readingSurface: true, chWidthPx: 0 },
    ],
  });
  expect(rows["line-length"]).toMatchObject({
    candidates: 5,
    judged: 1,
    affected: 1,
    excluded: { notProseTag: 1, chromeVoice: 1 },
    withheld: { glyphAdvanceUnmeasured: 1, chAdvanceUnmeasured: 1 },
  });
});

test("tight-leading excludes a heading and a `line-height: normal` computed value, and judges the rest", () => {
  const rows = rowsFor({
    textStyles: [
      { ...TEXT_BASE, lineHeightPx: 15 },
      { ...TEXT_BASE, selector: "h2.h", isHeading: true },
      { ...TEXT_BASE, selector: "p.n", lineHeightPx: null },
    ],
  });
  expect(rows["tight-leading"]).toMatchObject({ candidates: 3, judged: 1, affected: 1, excluded: { heading: 1, normalKeywordLeading: 1 } });
});

test("justified-text excludes a text-free element and judges the rest of the census", () => {
  const rows = rowsFor({
    textStyles: [
      { ...TEXT_BASE, textAlign: "justify" },
      { ...TEXT_BASE, selector: "div.wrap", directTextLen: 0 },
    ],
  });
  expect(rows["justified-text"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { noOwnText: 1 } });
});

test("all-caps-body excludes a heading — a caps heading is not a body passage", () => {
  const rows = rowsFor({
    textStyles: [
      { ...TEXT_BASE, textTransform: "uppercase" },
      { ...TEXT_BASE, selector: "h2.h", textTransform: "uppercase", isHeading: true },
    ],
  });
  expect(rows["all-caps-body"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { heading: 1 } });
});

test("wide-tracking excludes the ratified micro-caps voice while crushed-tracking still judges it", () => {
  const rows = rowsFor({
    textStyles: [
      { ...TEXT_BASE, letterSpacingPx: 1.5 },
      { ...TEXT_BASE, selector: "span.kicker", letterSpacingPx: 1.5, capsText: true },
    ],
  });
  expect(rows["wide-tracking"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { capsVoice: 1 } });
  expect(rows["crushed-tracking"]).toMatchObject({ candidates: 2, judged: 2, affected: 0, excluded: {} });
});

test("caveat-outweighed excludes every sample carrying no authored bounding claim, and judges the alerts", () => {
  const alert: TextStyleInput = {
    ...TEXT_BASE,
    selector: "p[role=alert]",
    alertContext: true,
    blockPath: [7, 3, 1],
    directText: "These exact hostnames, and nothing else.",
    directTextLen: 40,
    fontSizePx: 10.5,
  };
  const loud: TextStyleInput = { ...TEXT_BASE, selector: "span.datum", blockPath: [7, 3, 1], fontSizePx: 15 };
  const rows = rowsFor({ textStyles: [alert, loud] });
  expect(rows["caveat-outweighed"]).toMatchObject({ candidates: 2, judged: 1, affected: 1, excluded: { noAuthoredCaveatClaim: 1 } });
});

test("a wholly excluded rule still publishes its candidates — a zero denominator and a zero verdict differ", () => {
  const rows = rowsFor({
    radialGlows: [
      { selector: "div.owner", value: "radial-gradient(circle, rgba(235,110,40,0.7) 0%, transparent 70%)", width: 400, height: 300, sanctioned: true },
    ],
  });
  expect(rows["radial-halo"]).toMatchObject({ candidates: 1, judged: 0, affected: 0, excluded: { sanctionedGlowCarrier: 1 } });
  expect(rowsFor({})["radial-halo"]).toMatchObject({ candidates: 0, judged: 0, affected: 0, excluded: {} });
});

// ── The table's own parity pin ────────────────────────────────────────────────
// The rung table is PROSE in collect.ts's header (owner ruling 2026-09-01: a table, not a gate — rule
// shape is a judgment a checker cannot make). Prose rots, so the one mechanical claim it makes — that
// every registered rule appears EXACTLY ONCE — is pinned here: a rule added to the registry without a
// decided rung goes red, and so does a rule named twice or a stale id left behind by a rename.
test("every registered rule appears exactly once in collect.ts's rung assignment table", async () => {
  const source = await readFile(new URL("../../../../tooling/src/ui-audit/lib/collect.ts", import.meta.url), "utf8");
  const header = source.slice(source.indexOf("THE RUNG ASSIGNMENT TABLE"), source.indexOf("\nimport "));
  expect(header.length, "the header block must be readable — a zero-length slice would pass every count below").toBeGreaterThan(1000);
  const missing: string[] = [];
  const duplicated: string[] = [];
  for (const id of DESIGN_AUDIT_RULE_IDS) {
    // Whole-token match: `contrast` must not be satisfied by `hover-contrast`.
    const hits = header.match(new RegExp(`(?<![-\\w])${id}(?![-\\w])`, "gu"))?.length ?? 0;
    if (hits === 0) {
      missing.push(id);
    } else if (hits > 1) {
      duplicated.push(`${id} x${String(hits)}`);
    }
  }
  expect({ missing, duplicated }).toEqual({ missing: [], duplicated: [] });
});
