// Fixture tests for the pure classify functions in scripts/probes/design-audit.ts's checks module — no
// browser needed (Spine-Testing.md §7: the vitest node lanes have no DOM). Each test hand-builds a
// DOM/CSSOM-like plain-data input (colors, sizes, booleans) exactly as the in-page walker would produce
// it, and asserts the SAME deterministic verdict a live page would get. Mirrors
// tests/tooling/trace-render.test.ts's approach to testing a scripts/ tool's pure core.
// The impeccable-adapted checks (origin "impeccable") each get a firing fixture AND a passing/exempt
// control — a green that cannot fail is not a fence.

import { parseAuditArgs } from "../../scripts/probes/design-audit.ts";
import type { AccentBorderInput, Backdrop, IconTileInput, RawSamples, Rgb, TextStyleInput } from "../../scripts/probes/design-audit-checks.ts";
import {
  checkAccentBorder,
  checkAccessibleName,
  checkAnimatedImgHover,
  checkBgPattern,
  checkBrokenImage,
  checkClippedOverflow,
  checkContrast,
  checkEdgeFlush,
  checkFontCensus,
  checkGlowShadow,
  checkGradientText,
  checkGrayOnColor,
  checkHeadingOrder,
  checkIconTile,
  checkImageDistortion,
  checkMainLandmark,
  checkMotionStatic,
  checkNestedCard,
  checkRadialGlow,
  checkRepeatedText,
  checkScriptErrors,
  checkTabIndexSmell,
  checkTapTarget,
  checkTextOverflow,
  checkTextStyle,
  checkZIndex,
  collectFindings,
  INTERACTIVE_TEXT_FLOOR_PX,
  isAtOrAboveSeverity,
  isValidSeverity,
  LEADING_FLOOR,
  TEXT_MICRO_PX,
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

test("a gradient with a TRANSLUCENT stop refuses (indeterminate P1) instead of trusting fake stop math", () => {
  // Alpha-blind worst-stop math was the documented gradient blind spot: a rgba(0,0,0,0.5) scrim
  // stop composites with whatever is underneath, so any computed ratio would be a lie.
  const finding = checkContrast({
    selector: ".scrim-title",
    color: WHITE,
    backdrop: { kind: "gradient", stops: [{ r: 0, g: 0, b: 0, a: 0.5 }, BLACK] },
    fontSizePx: 24,
    fontWeight: 700,
  });
  expect(finding).not.toBeNull();
  expect(finding?.rule).toBe("text-over-art");
  expect(finding?.severity).toBe("P1");
  expect(finding?.value).toContain("translucent");
});

// ── gray-on-color (impeccable) ───────────────────────────────────────────────

const SATURATED_BLUE: Rgb = { r: 30, g: 60, b: 210 };

test("gray text on a saturated colored background fires gray-on-color at P2", () => {
  const finding = checkGrayOnColor({
    selector: ".washed",
    color: { r: 128, g: 128, b: 128 },
    backdrop: { kind: "flat", color: SATURATED_BLUE },
    fontSizePx: 14,
    fontWeight: 400,
  });
  expect(finding?.rule).toBe("gray-on-color");
  expect(finding?.severity).toBe("P2");
  expect(finding?.origin).toBe("impeccable");
});

test("gray-on-color stays quiet on a neutral background and for chromatic text", () => {
  const onNeutral = checkGrayOnColor({
    selector: ".a",
    color: { r: 128, g: 128, b: 128 },
    backdrop: FLAT_WHITE,
    fontSizePx: 14,
    fontWeight: 400,
  });
  const chromaticText = checkGrayOnColor({
    selector: ".b",
    color: { r: 200, g: 120, b: 40 },
    backdrop: { kind: "flat", color: SATURATED_BLUE },
    fontSizePx: 14,
    fontWeight: 400,
  });
  expect(onNeutral).toBeNull();
  expect(chromaticText).toBeNull();
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

// ── broken images (impeccable) ───────────────────────────────────────────────

test("a broken image fires at P1 for both reasons", () => {
  expect(checkBrokenImage({ selector: "img.avatar", reason: "failed-load" }).severity).toBe("P1");
  expect(checkBrokenImage({ selector: "img.empty", reason: "empty-src" }).rule).toBe("broken-image");
});

// ── #4 tap targets (pointer-conditional floor) ───────────────────────────────

test("coarse pointer: a <44px target (short side 40px, still >=32px) WARNs at P2", () => {
  const finding = checkTapTarget({ selector: "button.icon", width: 40, height: 40 }, true);
  expect(finding).not.toBeNull();
  expect(finding?.severity).toBe("P2");
});

test("coarse pointer: a target below the 32px hard floor FAILs at P1", () => {
  const finding = checkTapTarget({ selector: "button.tiny", width: 24, height: 24 }, true);
  expect(finding?.severity).toBe("P1");
});

test("coarse pointer: a target at/above 44px reports no finding", () => {
  const finding = checkTapTarget({ selector: "button.big", width: 48, height: 48 }, true);
  expect(finding).toBeNull();
});

// Fine pointer (mouse) only owes WCAG AA's 24px floor — the desktop control scale (32/34/40px) is
// deliberate density (D62 P1), NOT a defect. This is the regression the pointer-aware floor fixes.
test("fine pointer: the 32px desktop control scale is clean (no false positive)", () => {
  const finding = checkTapTarget({ selector: "select.sm", width: 220, height: 32 }, false);
  expect(finding).toBeNull();
});

test("fine pointer: a genuinely tiny <24px target still FAILs at P1", () => {
  const finding = checkTapTarget({ selector: "button.tiny", width: 20, height: 20 }, false);
  expect(finding?.severity).toBe("P1");
  expect(finding?.message).toContain("24px");
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

// ── heading order (impeccable; N7) ───────────────────────────────────────────

test("an h1→h3 skip fires skipped-heading at P2; a clean descent passes", () => {
  const skipped = checkHeadingOrder([
    { level: 1, text: "Library" },
    { level: 3, text: "Recent" },
  ]);
  expect(skipped).toHaveLength(1);
  expect(skipped[0]?.rule).toBe("skipped-heading");
  expect(skipped[0]?.severity).toBe("P2");
  const clean = checkHeadingOrder([
    { level: 1, text: "Library" },
    { level: 2, text: "Recent" },
    { level: 3, text: "Today" },
    { level: 2, text: "Archive" },
  ]);
  expect(clean).toEqual([]);
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
  expect(checkGradientText({ selector: ".hero-h1", hasGradientText: true })?.rule).toBe("gradient-text");
  expect(checkGradientText({ selector: ".body", hasGradientText: false })).toBeNull();
});

test("an <img> with a hover transform is flagged; a static one is not", () => {
  expect(checkAnimatedImgHover({ selector: "img.card-art", hasHoverAnimation: true })?.rule).toBe("animated-img-hover");
  expect(checkAnimatedImgHover({ selector: "img.static", hasHoverAnimation: false })).toBeNull();
});

// ── typography floors (impeccable, ramp-bound) ───────────────────────────────

const TEXT_STYLE_BASE: TextStyleInput = {
  selector: ".t",
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
  isProseTag: true,
  isHeading: false,
  interactive: false,
  codeContext: false,
  srOnly: false,
};

test("text below the ratified micro step fires text-below-ramp at P2; AT the micro step it passes", () => {
  const below = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 9 });
  expect(below.map((f) => f.rule)).toContain("text-below-ramp");
  const atMicro = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: TEXT_MICRO_PX });
  expect(atMicro.map((f) => f.rule)).not.toContain("text-below-ramp");
});

test("interactive text below 11px fires undersized-ui-text even at the micro token (ramp doesn't launder controls)", () => {
  const atMicroInteractive = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: TEXT_MICRO_PX, interactive: true });
  expect(TEXT_MICRO_PX).toBeLessThan(INTERACTIVE_TEXT_FLOOR_PX); // the premise this test rests on
  expect(atMicroInteractive.map((f) => f.rule)).toContain("undersized-ui-text");
  // Below the ramp, only text-below-ramp fires — the two floors never double-flag one element.
  const belowBoth = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 9, interactive: true });
  expect(belowBoth.map((f) => f.rule)).toContain("text-below-ramp");
  expect(belowBoth.map((f) => f.rule)).not.toContain("undersized-ui-text");
});

test("code contexts and sr-only text are exempt from the type floors", () => {
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 8, codeContext: true }).map((f) => f.rule)).not.toContain("text-below-ramp");
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 8, srOnly: true })).toEqual([]);
});

test("an over-wide prose block fires line-length; a normal measure passes", () => {
  // 15px font × 0.5 = 7.5px/char estimate; 900px ≈ 120 chars/line — far past the 85 gate.
  const wide = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 900 });
  expect(wide.map((f) => f.rule)).toContain("line-length");
  const normal = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 500 });
  expect(normal.map((f) => f.rule)).not.toContain("line-length");
});

test("leading below the ratified floor fires tight-leading; AT the floor (leading.label) it is legal", () => {
  const tight = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 15, lineHeightPx: 16.5 }); // 1.1×
  expect(tight.map((f) => f.rule)).toContain("tight-leading");
  const atFloor = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 16, lineHeightPx: 16 * LEADING_FLOOR });
  expect(atFloor.map((f) => f.rule)).not.toContain("tight-leading");
});

test("justified text without hyphens fires; hyphens:auto passes", () => {
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, textAlign: "justify" }).map((f) => f.rule)).toContain("justified-text");
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, textAlign: "justify", hyphens: "auto" }).map((f) => f.rule)).not.toContain("justified-text");
});

test("long uppercase body fires all-caps-body; headings and short caps labels are exempt", () => {
  const caps = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 60 });
  expect(caps.map((f) => f.rule)).toContain("all-caps-body");
  const heading = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 60, isHeading: true });
  expect(heading.map((f) => f.rule)).not.toContain("all-caps-body");
  const shortLabel = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 12 });
  expect(shortLabel.map((f) => f.rule)).not.toContain("all-caps-body");
});

test("wide tracking on running text fires; the uppercase micro-caps voice is exempt", () => {
  // 0.08em of tracking.micro on 15px text = 1.2px — over the 0.05em body gate.
  const wide = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2 });
  expect(wide.map((f) => f.rule)).toContain("wide-tracking");
  const caps = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2, textTransform: "uppercase", directTextLen: 25 });
  expect(caps.map((f) => f.rule)).not.toContain("wide-tracking");
});

test("crushed tracking fires strictly below the −0.04em floor; the floor itself is legal", () => {
  const crushed = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 20, letterSpacingPx: -1.0 }); // −0.05em
  expect(crushed.map((f) => f.rule)).toContain("crushed-tracking");
  const atFloor = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 20, letterSpacingPx: -0.8 }); // −0.04em
  expect(atFloor.map((f) => f.rule)).not.toContain("crushed-tracking");
});

// ── accent borders (impeccable side-tab family) ──────────────────────────────

const ACCENT_BASE: AccentBorderInput = {
  selector: ".card",
  tag: "div",
  widths: { top: 0, right: 0, bottom: 0, left: 0 },
  colors: { top: null, right: null, bottom: null, left: null },
  radius: 0,
  badgeLike: false,
  tabContext: false,
  statusContext: false,
};
const ACCENT_RED: Rgb = { r: 220, g: 40, b: 40, a: 1 };

test("a thick chromatic left border fires side-tab at P3", () => {
  const findings = checkAccentBorder({
    ...ACCENT_BASE,
    widths: { ...ACCENT_BASE.widths, left: 4 },
    colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
  });
  expect(findings.map((f) => f.rule)).toContain("side-tab");
  expect(findings[0]?.origin).toBe("impeccable");
});

test("a status/alert region wearing a severity edge is exempt; a neutral border never fires", () => {
  const status = checkAccentBorder({
    ...ACCENT_BASE,
    statusContext: true,
    widths: { ...ACCENT_BASE.widths, left: 4 },
    colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
  });
  expect(status).toEqual([]);
  const neutral = checkAccentBorder({
    ...ACCENT_BASE,
    widths: { ...ACCENT_BASE.widths, left: 4 },
    colors: { ...ACCENT_BASE.colors, left: { r: 80, g: 80, b: 80, a: 1 } },
  });
  expect(neutral).toEqual([]);
});

test("a thick chromatic top border on a rounded card fires border-accent-on-rounded; a tab underline is exempt", () => {
  const rounded = checkAccentBorder({
    ...ACCENT_BASE,
    radius: 8,
    widths: { ...ACCENT_BASE.widths, top: 3 },
    colors: { ...ACCENT_BASE.colors, top: ACCENT_RED },
  });
  expect(rounded.map((f) => f.rule)).toContain("border-accent-on-rounded");
  const tabUnderline = checkAccentBorder({
    ...ACCENT_BASE,
    tabContext: true,
    widths: { ...ACCENT_BASE.widths, bottom: 3 },
    colors: { ...ACCENT_BASE.colors, bottom: ACCENT_RED },
  });
  expect(tabUnderline).toEqual([]);
});

test("a uniform border (no dominant edge) never fires side-tab", () => {
  const uniform = checkAccentBorder({
    ...ACCENT_BASE,
    widths: { top: 3, right: 3, bottom: 3, left: 3 },
    colors: { top: ACCENT_RED, right: ACCENT_RED, bottom: ACCENT_RED, left: ACCENT_RED },
  });
  expect(uniform).toEqual([]);
});

// ── glow shadows (impeccable dark-glow) ──────────────────────────────────────

test("a zero-offset chromatic halo fires glow-shadow on any backdrop", () => {
  const finding = checkGlowShadow({
    selector: ".cta",
    boxShadow: "rgb(59, 130, 246) 0px 0px 20px 0px",
    textShadow: "",
    backdropColor: WHITE,
  });
  expect(finding?.rule).toBe("glow-shadow");
  expect(finding?.severity).toBe("P3");
});

test("a chromatic blurred shadow on a DARK backdrop fires; the same shadow on light passes", () => {
  const dark = checkGlowShadow({
    selector: ".panel",
    boxShadow: "rgb(59, 130, 246) 4px 8px 24px 0px",
    textShadow: "",
    backdropColor: { r: 10, g: 10, b: 12 },
  });
  expect(dark?.rule).toBe("glow-shadow");
  const light = checkGlowShadow({
    selector: ".panel",
    boxShadow: "rgb(59, 130, 246) 4px 8px 24px 0px",
    textShadow: "",
    backdropColor: WHITE,
  });
  expect(light).toBeNull();
});

test("neutral elevation shadows and unparseable (oklch token) colors are skipped, never guessed", () => {
  const neutral = checkGlowShadow({
    selector: ".card",
    boxShadow: "rgba(0, 0, 0, 0.3) 0px 4px 16px 0px",
    textShadow: "",
    backdropColor: { r: 10, g: 10, b: 12 },
  });
  expect(neutral).toBeNull();
  const oklch = checkGlowShadow({
    selector: ".sanctioned",
    boxShadow: "oklch(0.72 0.175 52 / 0.4) 0px 0px 18px 0px",
    textShadow: "",
    backdropColor: { r: 10, g: 10, b: 12 },
  });
  expect(oklch).toBeNull();
});

// ── radial washes (impeccable radial-halo / radial-spotlight-glow) ───────────

test("a saturated radial wash fading to transparent fires radial-halo at P2", () => {
  const finding = checkRadialGlow({
    selector: ".hero",
    value: "radial-gradient(circle at 50% 30%, rgba(120, 60, 255, 0.8), transparent 70%)",
    width: 800,
    height: 400,
    sanctioned: false,
  });
  expect(finding?.rule).toBe("radial-halo");
  expect(finding?.severity).toBe("P2");
});

test("a low-alpha accent spotlight fires radial-spotlight-glow at P3", () => {
  const finding = checkRadialGlow({
    selector: ".section",
    value: "radial-gradient(circle at 52% 38%, rgba(80, 111, 255, 0.26), transparent 44%)",
    width: 600,
    height: 300,
    sanctioned: false,
  });
  expect(finding?.rule).toBe("radial-spotlight-glow");
  expect(finding?.severity).toBe("P3");
});

test("sanctioned carriers, small surfaces, neutral vignettes, and non-fading gradients all pass", () => {
  const spotlightValue = "radial-gradient(circle, rgba(80, 111, 255, 0.26), transparent 44%)";
  expect(checkRadialGlow({ selector: ".aura", value: spotlightValue, width: 600, height: 300, sanctioned: true })).toBeNull();
  expect(checkRadialGlow({ selector: ".badge", value: spotlightValue, width: 40, height: 40, sanctioned: false })).toBeNull();
  const neutralVignette = "radial-gradient(circle, rgba(0, 0, 0, 0.3), transparent)";
  expect(checkRadialGlow({ selector: ".vignette", value: neutralVignette, width: 600, height: 300, sanctioned: false })).toBeNull();
  const realBackground = "radial-gradient(circle, rgb(40, 40, 60), rgb(20, 20, 30))";
  expect(checkRadialGlow({ selector: ".bg", value: realBackground, width: 600, height: 300, sanctioned: false })).toBeNull();
});

// ── decorative bg patterns (impeccable stripes / grid) ───────────────────────

test("stripe and grid pattern samples fire their P3 rules; a sliver-sized element passes", () => {
  const stripe = checkBgPattern({ selector: ".texture", kind: "stripe", backgroundSize: "auto", width: 400, height: 200 });
  expect(stripe?.rule).toBe("stripe-background");
  const grid = checkBgPattern({ selector: ".blueprint", kind: "grid", backgroundSize: "24px 24px", width: 800, height: 600 });
  expect(grid?.rule).toBe("grid-line-background");
  const sliver = checkBgPattern({ selector: ".divider", kind: "stripe", backgroundSize: "auto", width: 400, height: 2 });
  expect(sliver).toBeNull();
});

// ── icon tile above heading (impeccable icon-tile-stack) ─────────────────────

const ICON_TILE_BASE: IconTileInput = {
  headingTag: "h3",
  headingText: "Fast setup",
  headingTop: 300,
  siblingSelector: ".feature-icon",
  siblingWidth: 48,
  siblingHeight: 48,
  siblingBottom: 290,
  siblingBgAlpha: 1,
  siblingHasBgImage: false,
  siblingBorderWidth: 0,
  siblingRadiusPx: 12,
  hasIconChild: true,
  iconChildWidth: 24,
};

test("the canonical rounded-square icon tile above a heading fires icon-tile-stack at P3", () => {
  const finding = checkIconTile(ICON_TILE_BASE);
  expect(finding?.rule).toBe("icon-tile-stack");
  expect(finding?.severity).toBe("P3");
});

test("circles (avatars), oversized siblings, and tiles without an icon child all pass", () => {
  expect(checkIconTile({ ...ICON_TILE_BASE, siblingRadiusPx: 24 })).toBeNull(); // radius ≥ w/2 = circle
  expect(checkIconTile({ ...ICON_TILE_BASE, siblingWidth: 300, siblingHeight: 300 })).toBeNull();
  expect(checkIconTile({ ...ICON_TILE_BASE, hasIconChild: false })).toBeNull();
});

// ── static motion offenders (impeccable bounce/layout-transition) ────────────

test("bounce animation names and overshoot beziers fire bounce-easing at P2 (motion law §4.3)", () => {
  const named = checkMotionStatic({ selector: ".badge", kind: "bounce-name", value: "bounce-in", panelExempt: false });
  expect(named?.rule).toBe("bounce-easing");
  expect(named?.severity).toBe("P2");
  const bezier = checkMotionStatic({ selector: ".pop", kind: "overshoot-bezier", value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", panelExempt: false });
  expect(bezier?.rule).toBe("bounce-easing");
});

test("a layout-property transition fires at P3; the accordion/collapsible panel slots are exempt (motion law §3.7)", () => {
  const finding = checkMotionStatic({ selector: ".drawer", kind: "layout-transition", value: "width, padding", panelExempt: false });
  expect(finding?.rule).toBe("layout-transition");
  expect(finding?.severity).toBe("P3");
  expect(checkMotionStatic({ selector: ".panel", kind: "layout-transition", value: "height", panelExempt: true })).toBeNull();
});

// ── page censuses (impeccable, ramp-bound) ───────────────────────────────────

test("a rendered face outside the token stacks fires off-theme-font; the token faces are clean", () => {
  const findings = checkFontCensus({ families: ["geist", "inter"], sizes: [] });
  expect(findings).toHaveLength(1);
  expect(findings[0]?.rule).toBe("off-theme-font");
  expect(findings[0]?.value).toBe("inter");
  expect(checkFontCensus({ families: ["geist", "geist mono"], sizes: [] })).toEqual([]);
});

test("a compressed size spread fires flat-type-hierarchy; the real ramp spread passes", () => {
  const flat = checkFontCensus({ families: [], sizes: [12, 13, 14] });
  expect(flat.map((f) => f.rule)).toContain("flat-type-hierarchy");
  const ramp = checkFontCensus({ families: [], sizes: [10.5, 13, 15, 24] });
  expect(ramp).toEqual([]);
});

// ── measured-spill pass-throughs (impeccable) ────────────────────────────────

test("text-overflow, repeated-container-text, clipped-overflow, and edge-flush-cards carry their fixed severities", () => {
  expect(checkTextOverflow({ selector: ".cell", spillPx: 45, mode: "inline" }).severity).toBe("P1");
  expect(checkRepeatedText({ containerSelector: ".card", text: "Active", count: 3, distinctSigs: 3 }).severity).toBe("P3");
  expect(checkClippedOverflow({ selector: ".row", childSelector: ".menu" }).severity).toBe("P2");
  expect(checkEdgeFlush({ scrollerSelector: ".strip", cardSelector: ".chip", edge: "right", gapPx: 2, count: 3 }).severity).toBe("P3");
});

// ── script errors (impeccable; runner-side capture) ──────────────────────────

test("script errors dedupe by first line, cap at 3, and fire at P0", () => {
  const findings = checkScriptErrors([
    "TypeError: x is undefined\n  at boot.js:1",
    "TypeError: x is undefined\n  at boot.js:9", // duplicate first line
    "ReferenceError: y\n  at a.js:2",
    "SyntaxError: z\n  at b.js:3",
    "RangeError: w\n  at c.js:4", // over the cap
  ]);
  expect(findings).toHaveLength(3);
  expect(findings.every((f) => f.severity === "P0" && f.rule === "script-error")).toBe(true);
});

test("no page errors means no script-error findings", () => {
  expect(checkScriptErrors([])).toEqual([]);
});

// ── severity ordering + the fail-on gate ─────────────────────────────────────

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

const EMPTY_SAMPLES: RawSamples = {
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
  fontCensus: { families: [], sizes: [] },
  brokenImages: [],
  headings: [],
  overflows: [],
  repeatedTexts: [],
  clippedOverflows: [],
  edgeFlushCards: [],
};

test("collectFindings fans a raw-sample bundle out to exactly the findings each sample warrants", () => {
  const findings = collectFindings({
    ...EMPTY_SAMPLES,
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
    // 20px fails even the fine-pointer AA floor, so the finding fires under the realistic desktop default.
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
  });
  const rules = findings.map((f) => f.rule).sort((a, b) => a.localeCompare(b));
  expect(rules).toEqual(["aria-name", "contrast", "tap-target"]);
});

test("collectFindings fans the impeccable-adapted sample families out too, origin-tagged", () => {
  const findings = collectFindings({
    ...EMPTY_SAMPLES,
    textStyles: [{ ...TEXT_STYLE_BASE, fontSizePx: 9 }],
    brokenImages: [{ selector: "img.dead", reason: "failed-load" }],
    overflows: [{ selector: ".cell", spillPx: 30, mode: "block" }],
    fontCensus: { families: ["comic sans ms"], sizes: [] },
  });
  const rules = findings.map((f) => f.rule).sort((a, b) => a.localeCompare(b));
  expect(rules).toEqual(["broken-image", "off-theme-font", "text-below-ramp", "text-overflow"]);
  expect(findings.every((f) => f.origin === "impeccable")).toBe(true);
});

test("collectFindings on an all-clean bundle (incl. a present main landmark) returns nothing", () => {
  expect(collectFindings(EMPTY_SAMPLES)).toEqual([]);
});

// ── CLI contract (scripts/probes/design-audit.ts) ────────────────────────────
// The scanner could reach no surface but home and swallowed unknown flags until 2026-08-16 — a typo'd
// audit scanned the landing page and reported it clean under the name of the surface you asked for.

test("design-audit queues nav flags and clicks in ONE argv order, so a chat room is reachable", () => {
  const args = parseAuditArgs(["/", "--goto", "modal:newChat", "--click", "[data-create]", "--open-chat", "current", "--context-tab", "rpg.game"]);

  expect(args.errors).toEqual([]);
  expect(args.actions).toEqual([
    { kind: "nav", method: "goto", target: "modal:newChat" },
    { kind: "click", selector: "[data-create]" },
    { kind: "nav", method: "open-chat", target: "current" },
    { kind: "nav", method: "context-tab", target: "rpg.game" },
  ]);
});

test("design-audit refuses an unknown flag instead of ignoring it", () => {
  expect(parseAuditArgs(["/", "--gotoo", "presets"]).errors).toContain("unknown flag --gotoo");
  expect(parseAuditArgs(["/one", "/two"]).errors).toContain("expected at most one route, got 2");
  expect(parseAuditArgs(["--goto"]).errors).toContain("--goto requires a value");
  expect(parseAuditArgs(["--viewport", "wide"]).errors).toContain('--viewport expects positive WxH, got "wide"');
  expect(parseAuditArgs(["--fail-on", "P9"]).errors).toContain('--fail-on expects P0|P1|P2|P3, got "P9"');
});

test("--mobile selects a coarse-pointer DEVICE, not a narrow viewport; --viewport/--desktop clear it", () => {
  // The tap-target floor is pointer-conditional: a bare narrow viewport still renders pointer:fine and
  // judges every control against 24px instead of the 44px touch minimum (0 of 13 real failures seen).
  expect(parseAuditArgs(["/", "--mobile"]).device).toBe("iPhone 14 Pro Max");
  expect(parseAuditArgs(["/", "--mobile", "--viewport", "800x600"]).device).toBeNull();
  expect(parseAuditArgs(["/", "--mobile", "--desktop"]).device).toBeNull();
  expect(parseAuditArgs(["/"]).device).toBeNull();
});
