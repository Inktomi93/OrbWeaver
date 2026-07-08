// Fixture tests for the pure classify functions in scripts/probes/design-audit.ts's checks module — no
// browser needed (Spine-Testing.md §7: the vitest node lanes have no DOM). Each test hand-builds a
// DOM/CSSOM-like plain-data input (colors, sizes, booleans) exactly as the in-page walker would produce
// it, and asserts the SAME deterministic verdict a live page would get. Mirrors
// tests/tooling/trace-render.test.ts's approach to testing a scripts/ tool's pure core.
import type { Backdrop, Rgb } from "../../scripts/probes/design-audit-checks.ts";
import {
  checkAccessibleName,
  checkAnimatedImgHover,
  checkContrast,
  checkGradientText,
  checkImageDistortion,
  checkMainLandmark,
  checkNestedCard,
  checkTabIndexSmell,
  checkTapTarget,
  checkZIndex,
  collectFindings,
  isAtOrAboveSeverity,
  isValidSeverity,
} from "../../scripts/probes/design-audit-checks.ts";
import { expect, test } from "../support/fixtures.ts";

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const LIGHT_GRAY: Rgb = { r: 210, g: 210, b: 210 };
const FLAT_WHITE: Backdrop = { kind: "flat", color: WHITE };

// ── #1 contrast ───────────────────────────────────────────────────────────────

test("a low-contrast pair (light gray on white, normal text) FAILs", () => {
  const finding = checkContrast({
    selector: ".muted",
    color: LIGHT_GRAY,
    backdrop: FLAT_WHITE,
    fontSizePx: 14,
    fontWeight: 400,
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("contrast");
  expect(finding?.severity).toBe("P1");
});

test("a passing pair (black on white, normal text) reports no finding", () => {
  const finding = checkContrast({
    selector: ".body",
    color: BLACK,
    backdrop: FLAT_WHITE,
    fontSizePx: 14,
    fontWeight: 400,
  });
  expect(finding).toBeNull();
});

test("large text gets the relaxed 3:1 floor — a ratio that fails normal text can pass large text", () => {
  // ~3.95:1 against white — fails the 4.5:1 normal floor, clears the 3:1 large floor.
  const midGray: Rgb = { r: 128, g: 128, b: 128 };
  const normal = checkContrast({
    selector: ".x",
    color: midGray,
    backdrop: FLAT_WHITE,
    fontSizePx: 14,
    fontWeight: 400,
  });
  const large = checkContrast({
    selector: ".x",
    color: midGray,
    backdrop: FLAT_WHITE,
    fontSizePx: 24,
    fontWeight: 400,
  });
  expect(normal).not.toBeNull();
  expect(large).toBeNull();
});

// ── #2 text-over-art ─────────────────────────────────────────────────────────

test("text over a background-image with no flat/gradient color is indeterminate and FAILs at P1", () => {
  const finding = checkContrast({
    selector: ".hero-title",
    color: WHITE,
    backdrop: { kind: "image-indeterminate" },
    fontSizePx: 24,
    fontWeight: 700,
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("text-over-art");
  expect(finding?.severity).toBe("P1");
});

test("text over a gradient FAILs at P0 when the worst color stop is low-contrast", () => {
  const finding = checkContrast({
    selector: ".banner-title",
    color: WHITE,
    backdrop: { kind: "gradient", stops: [WHITE, LIGHT_GRAY] }, // white-on-white stop is the worst case
    fontSizePx: 24,
    fontWeight: 700,
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("text-over-art");
  expect(finding?.severity).toBe("P0");
});

test("text over a gradient passes when EVERY stop clears the ratio", () => {
  const finding = checkContrast({
    selector: ".banner-title",
    color: WHITE,
    backdrop: { kind: "gradient", stops: [BLACK, { r: 20, g: 20, b: 20 }] },
    fontSizePx: 24,
    fontWeight: 700,
  });
  expect(finding).toBeNull();
});

// ── #3 distorted image ───────────────────────────────────────────────────────

test("a stretched image (rendered aspect far from natural, object-fit: fill) FAILs", () => {
  const finding = checkImageDistortion({
    selector: "img.banner",
    naturalWidth: 1200,
    naturalHeight: 400, // 3:1 source
    renderedWidth: 600,
    renderedHeight: 600, // 1:1 rendered — squished tall
    objectFit: "fill",
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("distorted-image");
});

test("a cover-fit image with the same aspect mismatch passes (cropping is not stretching)", () => {
  const finding = checkImageDistortion({
    selector: "img.banner",
    naturalWidth: 1200,
    naturalHeight: 400,
    renderedWidth: 600,
    renderedHeight: 600,
    objectFit: "cover",
  });
  expect(finding).toBeNull();
});

test("an image whose rendered aspect matches its source (within tolerance) passes", () => {
  const finding = checkImageDistortion({
    selector: "img.thumb",
    naturalWidth: 800,
    naturalHeight: 600,
    renderedWidth: 400,
    renderedHeight: 300,
    objectFit: "fill",
  });
  expect(finding).toBeNull();
});

test("a severely distorted image (>=15% deviation) escalates to P1 over P2", () => {
  const mild = checkImageDistortion({
    selector: "img.a",
    naturalWidth: 100,
    naturalHeight: 100,
    renderedWidth: 100,
    renderedHeight: 94, // ~6% deviation
    objectFit: "fill",
  });
  const severe = checkImageDistortion({
    selector: "img.b",
    naturalWidth: 100,
    naturalHeight: 100,
    renderedWidth: 100,
    renderedHeight: 50, // 100% deviation
    objectFit: "fill",
  });
  expect(mild?.severity).toBe("P2");
  expect(severe?.severity).toBe("P1");
});

// ── #4 tap targets ───────────────────────────────────────────────────────────

test("a <44px target (short side 40px, still >=32px) WARNs at P2", () => {
  const finding = checkTapTarget({ selector: "button.icon", width: 40, height: 40 });
  expect(finding).not.toBeNull();
  expect(finding?.severity).toBe("P2");
});

test("a target below the 32px hard floor FAILs at P1", () => {
  const finding = checkTapTarget({ selector: "button.tiny", width: 24, height: 24 });
  expect(finding?.severity).toBe("P1");
});

test("a target at/above 44px reports no finding", () => {
  const finding = checkTapTarget({ selector: "button.big", width: 48, height: 48 });
  expect(finding).toBeNull();
});

// ── #5 ARIA navigability ─────────────────────────────────────────────────────

test("an unlabeled icon-button (no text, no aria-label/title/alt) FAILs", () => {
  const finding = checkAccessibleName({
    selector: "button.icon-close",
    tag: "button",
    hasVisibleText: false,
    ariaLabel: null,
    ariaLabelledbyText: null,
    title: null,
    altText: null,
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("aria-name");
  expect(finding?.severity).toBe("P1");
});

test("a labeled icon-button (aria-label set) passes", () => {
  const finding = checkAccessibleName({
    selector: "button.icon-close",
    tag: "button",
    hasVisibleText: false,
    ariaLabel: "Close dialog",
    ariaLabelledbyText: null,
    title: null,
    altText: null,
  });
  expect(finding).toBeNull();
});

test("visible text alone is enough to satisfy the accessible-name check", () => {
  const finding = checkAccessibleName({
    selector: "button.save",
    tag: "button",
    hasVisibleText: true,
    ariaLabel: null,
    ariaLabelledbyText: null,
    title: null,
    altText: null,
  });
  expect(finding).toBeNull();
});

test("an aria-label of only whitespace does NOT count as a name", () => {
  const finding = checkAccessibleName({
    selector: "button.icon",
    tag: "button",
    hasVisibleText: false,
    ariaLabel: "   ",
    ariaLabelledbyText: null,
    title: null,
    altText: null,
  });
  expect(finding).not.toBeNull();
});

test("a missing <main> landmark reports a P2 finding", () => {
  expect(checkMainLandmark({ main: false })).not.toBeNull();
});

test("a present <main> landmark reports no finding", () => {
  expect(checkMainLandmark({ main: true })).toBeNull();
});

test("a positive tabindex is flagged (breaks natural DOM tab order)", () => {
  const finding = checkTabIndexSmell({ selector: "div.weird", tabIndex: 5 });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("tabindex-positive");
});

test("tabindex=0 and tabindex=-1 are both fine (not a smell)", () => {
  expect(checkTabIndexSmell({ selector: "div.a", tabIndex: 0 })).toBeNull();
  expect(checkTabIndexSmell({ selector: "div.b", tabIndex: -1 })).toBeNull();
});

// ── #6 cheap in-DOM antipatterns ─────────────────────────────────────────────

test("z-index >= 999 is flagged; below it is not", () => {
  expect(checkZIndex({ selector: ".modal", zIndex: 1000 })?.rule).toBe("z-index-escalation");
  expect(checkZIndex({ selector: ".panel", zIndex: 50 })).toBeNull();
});

test("an egregious z-index (>=9999) escalates to P2 over the default P3", () => {
  expect(checkZIndex({ selector: ".x", zIndex: 999 })?.severity).toBe("P3");
  expect(checkZIndex({ selector: ".y", zIndex: 99_999 })?.severity).toBe("P2");
});

test("a nested card is flagged; a non-nested one is not", () => {
  expect(checkNestedCard({ selector: ".inner-card", isNested: true })?.rule).toBe("nested-card");
  expect(checkNestedCard({ selector: ".card", isNested: false })).toBeNull();
});

test("gradient-clipped text is flagged; plain text is not", () => {
  expect(checkGradientText({ selector: ".hero-h1", hasGradientText: true })?.rule).toBe(
    "gradient-text",
  );
  expect(checkGradientText({ selector: ".body", hasGradientText: false })).toBeNull();
});

test("an <img> with a hover transform is flagged; a static one is not", () => {
  expect(checkAnimatedImgHover({ selector: "img.card-art", hasHoverAnimation: true })?.rule).toBe(
    "animated-img-hover",
  );
  expect(checkAnimatedImgHover({ selector: "img.static", hasHoverAnimation: false })).toBeNull();
});

// ── severity ordering + the fail-on gate ─────────────────────────────────────

// biome-ignore lint/security/noSecrets: the test title embeds the function name under test, not a secret.
test("isAtOrAboveSeverity orders P0 as worst — P0 clears every floor, P3 clears only itself", () => {
  expect(isAtOrAboveSeverity("P0", "P1")).toBe(true);
  expect(isAtOrAboveSeverity("P1", "P1")).toBe(true);
  expect(isAtOrAboveSeverity("P2", "P1")).toBe(false);
  expect(isAtOrAboveSeverity("P3", "P3")).toBe(true);
});

test("isValidSeverity rejects anything outside P0-P3", () => {
  expect(isValidSeverity("P1")).toBe(true);
  expect(isValidSeverity("P4")).toBe(false);
  expect(isValidSeverity("")).toBe(false);
});

// ── aggregation ───────────────────────────────────────────────────────────────

test("collectFindings fans a raw-sample bundle out to exactly the findings each sample warrants", () => {
  const findings = collectFindings({
    texts: [
      { selector: ".ok", color: BLACK, backdrop: FLAT_WHITE, fontSizePx: 14, fontWeight: 400 },
      {
        selector: ".bad",
        color: LIGHT_GRAY,
        backdrop: FLAT_WHITE,
        fontSizePx: 14,
        fontWeight: 400,
      },
    ],
    images: [],
    tapTargets: [{ selector: "button.tiny", width: 20, height: 20 }],
    accessibleNames: [
      {
        selector: "button.icon",
        tag: "button",
        hasVisibleText: false,
        ariaLabel: null,
        ariaLabelledbyText: null,
        title: null,
        altText: null,
      },
    ],
    mainLandmarkPresent: true,
    tabIndexes: [],
    zIndexes: [],
    nestedCards: [],
    gradientTexts: [],
    animatedImgHovers: [],
  });
  const rules = findings.map((f) => f.rule).sort((a, b) => a.localeCompare(b));
  expect(rules).toEqual(["aria-name", "contrast", "tap-target"]);
});

test("collectFindings on an all-clean bundle (incl. a present main landmark) returns nothing", () => {
  const findings = collectFindings({
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
  });
  expect(findings).toEqual([]);
});
