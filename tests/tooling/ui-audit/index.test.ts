// Fixture tests for the pure classify functions in tooling/src/ui-audit/lib — no
// browser needed (Spine-Testing.md §7: the vitest node lanes have no DOM). Each test hand-builds a
// DOM/CSSOM-like plain-data input (colors, sizes, booleans) exactly as the in-page walker would produce
// it, and asserts the SAME deterministic verdict a live page would get. Mirrors
// tests/tooling/trace-render.test.ts's approach to testing a scripts/ tool's pure core.
// The impeccable-adapted checks (origin "impeccable") each get a firing fixture AND a passing/exempt
// control — a green that cannot fail is not a fence.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import type { AccentBorderInput, ActionDoorInput, Backdrop, IconTileInput, RawSamples, TextStyleInput } from "../../../tooling/src/ui-audit/index.ts";
import {
  checkAccentBorder,
  checkAccessibleName,
  checkAnimatedImgHover,
  checkBgPattern,
  checkBrokenImage,
  checkCaveatHierarchy,
  checkClippedOverflow,
  checkContrast,
  checkControlAspect,
  checkDuplicateDoors,
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
  parseAuditArgs,
  TEXT_MICRO_PX,
} from "../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

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

// ── ancestor opacity dims the FOREGROUND (issue #188) ────────────────────────
// CSS opacity groups the subtree and composites it, so a glyph inside an `opacity: 0.6` group is painted
// as a blend of its color and the backdrop while `style.color` still reports the authored value. snap's
// --contrast has composited since blind-spot round 2 (`dimmed α0.60`); design-audit measured the authored
// color and passed text the eye reads at 3.68:1.
const DIM_TEXT: Rgb = { r: 180, g: 180, b: 185 };
const NEAR_BLACK: Backdrop = { kind: "flat", color: { r: 16, g: 16, b: 20 } };

test("text at full opacity over a near-black backdrop passes; the SAME color at α0.6 fails on the composite", () => {
  const undimmed = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400 });
  expect(undimmed, "~9:1 undimmed — flagging it would be a false positive").toBeNull();

  const dimmed = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 0.6 });
  expect(dimmed?.rule).toBe("contrast");
  expect(dimmed?.value, "the value must name the dimming the way snap's --contrast does").toContain("dimmed α0.60");
});

// #466: below the measurable floor the composite IS the backdrop whatever the authored color is, so the
// ratio can only come out ~1.00:1 — arithmetic, not evidence. Measured live: a design-audit home run
// caught mid boot-animation filed TWO P1s reading `1.00:1 · dimmed α0.00` against the weave veil and the
// brand wordmark, which paint nothing at that instant. `isVisible` drops EXACTLY zero; this is the
// mid-fade window it cannot see.
test("text below the measurable-opacity floor gets NO verdict — a ratio that can only come out 1.00:1 is not a measurement", () => {
  const midFade = checkContrast({ selector: ".veil", color: WHITE, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 0.004 });
  expect(midFade, "the pre-fix instrument filed this as a P1 contrast finding at 1.00:1").toBeNull();
  expect(
    checkContrast({ selector: ".veil", color: BLACK, backdrop: FLAT_WHITE, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 0.02 }),
    "the same tautology in the other direction — a black glyph at α0.02 on white is also just the backdrop",
  ).toBeNull();
});

test("the floor is FAR below the dimming the rule judges — α0.5/α0.6 text still fails on its composite", () => {
  const dimmed = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 0.6 });
  expect(dimmed?.rule, "issue #188's case must survive the #466 floor untouched").toBe("contrast");
  const halved = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 0.05 });
  expect(halved?.rule, "AT the floor the verdict still stands — the refusal is strictly below it").toBe("contrast");
});

test("an absent foregroundOpacity reads as 1 — an older walker's samples keep their verdict", () => {
  const withoutField = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400 });
  const explicitOne = checkContrast({ selector: ".line", color: DIM_TEXT, backdrop: NEAR_BLACK, fontSizePx: 14, fontWeight: 400, foregroundOpacity: 1 });
  expect(withoutField).toEqual(explicitOne);
});

test("a dimmed foreground is composited per gradient STOP, and the finding says so", () => {
  // White text at α0.25 over near-black stops paints ~rgb(70,70,70) — unreadable, while the authored
  // white clears every stop comfortably.
  const dimmed = checkContrast({
    selector: ".banner",
    color: WHITE,
    backdrop: { kind: "gradient", stops: [BLACK, { r: 20, g: 20, b: 20 }] },
    fontSizePx: 24,
    fontWeight: 700,
    foregroundOpacity: 0.25,
  });
  expect(dimmed?.rule).toBe("text-over-art");
  expect(dimmed?.value).toContain("dimmed α0.25");
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

// ── the backdrop the walk could not resolve (issue #218) ─────────────────────
// A DOM ancestor walk cannot see a fixed art layer painting over the base it finds. The old resolver
// composited a 0.65-alpha reading plate onto the app's near-black BODY base and reported 3.16:1 on 28
// transcript nodes whose real composite — over the wallpaper photo — is 4.94:1. `unresolved` is the
// walker saying it cannot know: the runner settles it from real pixels, or refuses out loud. Nothing may
// mint a ratio from `fallback`.

const UNRESOLVED_OVER_ART: Backdrop = { kind: "unresolved", reason: "paint-layer-over-base", fallback: { r: 160, g: 157, b: 155 } };

test("an UNRESOLVED backdrop yields NO contrast verdict — not even from its fallback", () => {
  // fallback rgb(160,157,155) against this text is the exact 3.16:1 the false P1s were minted from.
  const finding = checkContrast({
    selector: "[data-slot=message-bubble] em",
    color: { r: 86, g: 75, b: 59 },
    backdrop: UNRESOLVED_OVER_ART,
    fontSizePx: 15,
    fontWeight: 400,
  });
  expect(finding, "a backdrop nothing on screen is painted must produce no finding at all").toBeNull();
});

test("an UNRESOLVED backdrop is not a gray-on-color verdict either", () => {
  expect(
    checkGrayOnColor({
      selector: ".line",
      color: { r: 128, g: 128, b: 128 },
      backdrop: { kind: "unresolved", reason: "no-opaque-base", fallback: { r: 30, g: 60, b: 210 } },
      fontSizePx: 14,
      fontWeight: 400,
    }),
  ).toBeNull();
});

test("a PIXEL-SAMPLED backdrop is judged for contrast but never for gray-on-color", () => {
  // The runner rewrites an unresolved sample to `flat` from the real pixels. A luminance ratio is exactly
  // what pixels prove; "use a darker shade of the background's own hue" is advice about an AUTHORED color,
  // and run against the median of a wallpaper photo it minted five P2s about a photograph.
  const sampled = { selector: ".over-art", color: { r: 128, g: 128, b: 128 }, fontSizePx: 14, fontWeight: 400, backdropMethod: "pixel-sample" } as const;
  expect(checkGrayOnColor({ ...sampled, backdrop: { kind: "flat", color: SATURATED_BLUE } })).toBeNull();
  expect(checkContrast({ ...sampled, backdrop: { kind: "flat", color: { r: 150, g: 150, b: 150 } } })?.rule).toBe("contrast");
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

// A LOWER BOUND IS NOT A SIZE (#797). The walker marks a measurement whose outward hit-probe ring was cut
// by a viewport edge with no in-frame radius having genuinely failed — the control may own more than the
// number reported. Minting a sub-target finding from one is the phantom-P1 class that made this rule's raw
// count untrustworthy for a whole UX review (18 P1s at the default viewport, p1=0 at 1280x2200, identical
// element census). The withholding is COUNTED and printed by the runner (`censusReach.frameTruncated`), so
// it never renders as "measured, and fine".
test("a truncated-extent measurement WITHHOLDS the verdict rather than minting a phantom sub-target", () => {
  expect(checkTapTarget({ selector: "button.edge", width: 18, height: 18, extentTruncated: true }, false)).toBeNull();
  expect(checkTapTarget({ selector: "button.edge", width: 18, height: 18, extentTruncated: true }, true)).toBeNull();
});

test("the withholding is keyed on the FLAG, not on the number — the same box fully measured still FAILs", () => {
  expect(checkTapTarget({ selector: "button.edge", width: 18, height: 18, extentTruncated: false }, false)?.severity).toBe("P1");
  // Absent reads as "fully measured" — the fixture sample sets that predate the flag stay judged.
  expect(checkTapTarget({ selector: "button.edge", width: 18, height: 18 }, false)?.severity).toBe("P1");
});

// ── #4b control silhouette (#430, from side-eye #420) ────────────────────────
// The founding numbers are LIVE MEASUREMENTS, not invented fixtures
// (docs/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md, "Measured geometry"):
// the shipped coarse Switch was 48x44 (aspect 1.091, read as a crescent moon) and the fix is 64x44
// (aspect 1.455). Each carve below carries the reason it exists AND its passing control.
const SWITCH_SAMPLE = { selector: "[data-slot=switch-root]", role: "switch", animating: false };

test("the pre-#420 coarse Switch geometry (48x44, aspect 1.09) FIRES — the defect this rule exists for", () => {
  const finding = checkControlAspect({ ...SWITCH_SAMPLE, width: 48, height: 44 });
  expect(finding?.rule).toBe("control-aspect");
  expect(finding?.severity).toBe("P2");
  expect(finding?.value, "the finding must publish the measured aspect, not just a verdict").toContain("1.09");
  expect(finding?.value).toContain("48×44px");
});

test("the shipped fix (64x44, aspect 1.455) is CLEAN — the twin that makes the red above a plant", () => {
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 64, height: 44 })).toBeNull();
});

test("the fine-pointer arm (48x32, aspect 1.5) was never the defect and stays clean", () => {
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 48, height: 32 })).toBeNull();
});

// CARVE 1 — ORIENTATION. The ratio is long/short, so a vertical track is judged by the same number as a
// horizontal one instead of needing an aria-orientation sniff. A width/height ratio would flag every
// vertical track in the product at ~0.1 while passing the crescent at 1.09.
test("a vertical track (44x64) passes on the same relation that fails 48x44 — orientation is not a carve", () => {
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 44, height: 64 })).toBeNull();
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 20, height: 200 })).toBeNull();
});

// CARVE 2 — MID-FLIGHT GEOMETRY. A box read while a transition/animation is running measures a frame,
// not a design (the same trap that produced a retracted "widening does not restore travel" reading).
test("an ANIMATING near-square control is declined, not judged", () => {
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 48, height: 44, animating: true })).toBeNull();
});

// CARVE 3 — ROLES THE TABLE DOES NOT CLAIM. progressbar (a circular progress ring is a legitimate
// deliberate circle) and slider (role="slider" lands on the visually-hidden native input inside the
// THUMB here — tests/ui/primitives/slider/slider.ct.tsx:129-131 — never on the track) are declared out of
// reach rather than approximated; checkbox/radio are square by design.
test("a near-square progressbar/slider/checkbox is NOT judged — the refused roles, pinned", () => {
  for (const role of ["progressbar", "slider", "checkbox", "radio", "button", ""]) {
    expect(checkControlAspect({ selector: "[data-slot=x]", role, width: 44, height: 44, animating: false }), `role=${role} must not be judged`).toBeNull();
  }
});

// CARVE 4 — a degenerate box has no silhouette and no computable ratio.
test("a zero-height sample yields no verdict instead of a division by zero", () => {
  expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 48, height: 0 })).toBeNull();
});

test("an exactly-square switch is the worst case and fires at aspect 1.00", () => {
  const finding = checkControlAspect({ ...SWITCH_SAMPLE, width: 44, height: 44 });
  expect(finding?.value).toContain("1.00");
  expect(finding?.message).toContain("silhouette floor");
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

// #464: this rule used to divide by a GUESSED character width (fontSize × 0.5). Geist's real '0'
// advance is 0.573em, so every measure came out ~15% long and the rule filed an "86 chars" P3 against
// the home resume snippet, which is 75.0 REAL characters — the house's own ratified
// `--reading-measure: 75ch`. The denominator is now the MEASURED ch advance, and the arms below are
// pinned in real characters at the real Geist ratio (15px × 0.573 = 8.6px/ch).
const GEIST_CH_15PX = 8.6;

test("an over-wide prose block fires line-length; a normal measure passes", () => {
  // 900px / 8.6px ≈ 105 real chars — past the 85 gate.
  const wide = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 900, chWidthPx: GEIST_CH_15PX });
  expect(wide.map((f) => f.rule)).toContain("line-length");
  // 500px / 8.6px ≈ 58 real chars.
  const normal = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 500, chWidthPx: GEIST_CH_15PX });
  expect(normal.map((f) => f.rule)).not.toContain("line-length");
});

test("a line AT the ratified 75ch reading measure is clean — the instrument may not indict the house measure", () => {
  const atMeasure = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 75 * GEIST_CH_15PX, chWidthPx: GEIST_CH_15PX });
  const reported = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 75 * GEIST_CH_15PX, chWidthPx: GEIST_CH_15PX }).find(
    (f) => f.rule === "line-length",
  );

  expect(
    atMeasure.map((f) => f.rule),
    `75ch is the ratified measure; the old 0.5 guess reported it as ~86 chars and filed it. got ${JSON.stringify(reported)}`,
  ).not.toContain("line-length");
  // The pre-fix arithmetic, kept as the explicit regression this test exists for: the same box under
  // the guessed ratio reads 86 chars and fires.
  expect(Math.round((75 * GEIST_CH_15PX) / (TEXT_STYLE_BASE.fontSizePx * 0.5))).toBe(86);
});

test("line-length reports REAL characters, and refuses a verdict when the advance was not measured", () => {
  const measured = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 100 * GEIST_CH_15PX, chWidthPx: GEIST_CH_15PX }).find(
    (f) => f.rule === "line-length",
  );
  expect(measured?.value).toBe("100 chars/line");

  // A zero advance is "the canvas refused", not "a narrow line" — a bare number from an unmeasured
  // instrument is exactly the class of lie this fix exists to stop.
  const unmeasured = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 5000, chWidthPx: 0 });
  expect(unmeasured.map((f) => f.rule)).not.toContain("line-length");
});

test("tracking counts toward the measure — a tracked line fits fewer characters than its ch count", () => {
  const tracked = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 90 * GEIST_CH_15PX, chWidthPx: GEIST_CH_15PX, letterSpacingPx: 2 });
  const untracked = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 90 * GEIST_CH_15PX, chWidthPx: GEIST_CH_15PX });

  expect(
    untracked.map((f) => f.rule),
    "90 bare ch is past the gate",
  ).toContain("line-length");
  expect(
    tracked.map((f) => f.rule),
    "the same box with 2px tracking fits ~73 glyphs — not an over-long line",
  ).not.toContain("line-length");
});

test("leading below the ratified floor fires tight-leading; AT the floor (leading.label) it is legal", () => {
  const tight = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 15, lineHeightPx: 16.5 }); // 1.1×
  expect(tight.map((f) => f.rule)).toContain("tight-leading");
  const atFloor = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 16, lineHeightPx: 16 * LEADING_FLOOR });
  expect(atFloor.map((f) => f.rule)).not.toContain("tight-leading");
});

// #233, home-delta 2026-08-18: three of the reading arm's findings were THIS false positive, and the
// finding printed its own refutation ("line-height 1.25× (floor 1.25)"). At --font-scale 1.25 the body
// step computes to 13.125px and Chrome hands back a TRUNCATED line-height string ("16.4062px", not
// 16.40625) — 16.4062 / 13.125 = 1.2499657, a hair under the floor. The numbers below are the measured
// ones, not a synthetic epsilon: the fix must swallow Chrome's truncation and nothing wider.
test("a Chrome-truncated computed line-height AT the floor does not fire tight-leading (#233 float FP)", () => {
  const truncated = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 13.125, lineHeightPx: 16.4062 });
  expect(truncated.map((f) => f.rule)).not.toContain("tight-leading");
  // …and the epsilon stays a rounding allowance, not a weakened floor: genuinely tight leading still fires.
  const genuinelyTight = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 13.125, lineHeightPx: 13.125 * 1.24 });
  expect(genuinelyTight.map((f) => f.rule)).toContain("tight-leading");
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

test("TYPED caps are caps: the tracking exemption follows the rendered pixels, not the stylesheet", () => {
  // Issue #148 item 4: the exemption keyed on `text-transform` alone, so a kicker whose caps were authored
  // in the CONTENT ("SESSION SUMMARY") was flagged as running text — 4× on one panel, on the ratified voice.
  const typedCaps = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2, directTextLen: 25, capsText: true });
  expect(typedCaps.map((f) => f.rule)).not.toContain("wide-tracking");
  // Not a blanket: mixed-case text at the same tracking is still the defect the rule exists for.
  const mixed = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2, directTextLen: 25, capsText: false });
  expect(mixed.map((f) => f.rule)).toContain("wide-tracking");
  // A sample set from an older walker string carries no `capsText` — that reads as "not caps" (the old
  // behaviour), never as a free pass.
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2, directTextLen: 25 }).map((f) => f.rule)).toContain("wide-tracking");
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
  listRowSelected: false,
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

test("a thick chromatic LEFT border on a rounded card fires BOTH tells (issue #188)", () => {
  // The live home resume card's shape: border-left 3px accent on a 10px radius. The rule as born could
  // only reach `border-accent-on-rounded` from a top/bottom edge, so this card — the textbook example of
  // both §6 bans — reported at most one of them.
  const rules = checkAccentBorder({
    ...ACCENT_BASE,
    radius: 10,
    widths: { top: 1, right: 1, bottom: 1, left: 3 },
    colors: { top: null, right: null, bottom: null, left: ACCENT_RED },
  }).map((f) => f.rule);
  expect(rules).toContain("side-tab");
  expect(rules).toContain("border-accent-on-rounded");
});

test("the ratified ListRow selection accent is exempt, and neither half of the predicate exempts alone (issue #485)", () => {
  // OWNER RULED 2026-08-22: the selected-row left ember bar (a 2px `border-l-primary` on a rounded row) is
  // the app-wide selection idiom and stands as shipped. The `listRowSelected` sample is the walker's
  // two-halved verdict — the primitive's own slot AND `data-selected` — and this is the check's half of
  // that contract: the flag exempts, and its absence leaves the identical geometry fully judged.
  const selectedRow = checkAccentBorder({
    ...ACCENT_BASE,
    listRowSelected: true,
    radius: 6,
    widths: { ...ACCENT_BASE.widths, left: 2 },
    colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
  });
  expect(selectedRow, "the ratified selection idiom is not a card tell").toEqual([]);

  const sameGeometryUnratified = checkAccentBorder({
    ...ACCENT_BASE,
    radius: 6,
    widths: { ...ACCENT_BASE.widths, left: 2 },
    colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
  }).map((f) => f.rule);
  expect(sameGeometryUnratified, "the exemption is the FLAG, never the shape").toContain("side-tab");
  expect(sameGeometryUnratified).toContain("border-accent-on-rounded");
});

test("a badge-like chip keeps its side-edge exemption even with a radius", () => {
  const badge = checkAccentBorder({
    ...ACCENT_BASE,
    tag: "span",
    badgeLike: true,
    radius: 10,
    widths: { ...ACCENT_BASE.widths, left: 3 },
    colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
  });
  expect(badge, "a chip wearing a colored edge is house vocabulary, not a card tell").toEqual([]);
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

// ── the caveat/type-hierarchy-inversion lens (#652) ──────────────────────────
// The rendered halves live in cli.int.test.ts (the consent screen's own markup at two commits). These pin
// the FRAMING — the four narrowings that keep the rule from being the wall its first version was. Each
// exclusion here removed a measured false-positive class from a live sweep, so a green that stops
// enforcing one is a rule quietly widening back into noise.
const ALERT_CAVEAT: TextStyleInput = {
  ...TEXT_STYLE_BASE,
  selector: "p[role=alert]:nth-of-type(1)",
  alertContext: true,
  blockPath: [7, 3, 1],
  directText: "This plugin asks for 2 permissions this version of Orbweaver doesn't recognise.",
  directTextLen: 78,
  fontSizePx: 10.5,
  voice: "gloss",
};
const LOUD_HOSTNAME: TextStyleInput = {
  ...TEXT_STYLE_BASE,
  selector: "span[data-voice=datumMono]:nth-of-type(1)",
  blockPath: [9, 8, 3],
  directText: "api.example.com",
  directTextLen: 15,
  fontSizePx: 15,
  voice: "",
};

test("an alert sentence outweighed by a same-block sibling fires caveat-outweighed at P2", () => {
  const findings = checkCaveatHierarchy([ALERT_CAVEAT, LOUD_HOSTNAME]);
  expect(findings.map((f) => f.rule)).toEqual(["caveat-outweighed"]);
  expect(findings[0]?.severity).toBe("P2");
  expect(findings[0]?.selector, "the finding is filed against the whispering alert, not its partner").toBe("p[role=alert]:nth-of-type(1)");
  expect(findings[0]?.message, "and it must NAME the partner, or nobody can decide which side to change").toContain(
    "span[data-voice=datumMono]:nth-of-type(1)",
  );
});

test("the anchor is the ALERT ROLE, not the gloss voice — the voice arm measured 21 findings on 18 surfaces", () => {
  expect(checkCaveatHierarchy([{ ...ALERT_CAVEAT, alertContext: false }, LOUD_HOSTNAME])).toEqual([]);
});

test("a fragment is a qualifier, not a bounding claim — shape is length AND terminal punctuation", () => {
  const fragment = { ...ALERT_CAVEAT, directText: "since Tuesday", directTextLen: 13 };
  expect(checkCaveatHierarchy([fragment, LOUD_HOSTNAME])).toEqual([]);
  const unpunctuated = { ...ALERT_CAVEAT, directText: "This plugin asks for two permissions nobody here recognises" };
  expect(checkCaveatHierarchy([unpunctuated, LOUD_HOSTNAME])).toEqual([]);
});

test("the comparison is bounded to ONE BLOCK — a louder node elsewhere on the page is not a partner", () => {
  expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, blockPath: [40, 41, 42] }])).toEqual([]);
  // Absent paths DECLINE rather than falling back to a page-wide comparison, which is the wall. The key
  // is OMITTED, not set to undefined — `exactOptionalPropertyTypes` treats those as different shapes, and
  // the absent one is what a pre-#652 sample set actually looks like.
  const { blockPath: _omitted, ...pathless } = ALERT_CAVEAT;
  expect(checkCaveatHierarchy([pathless, LOUD_HOSTNAME])).toEqual([]);
});

test("a heading or a chrome-label voice is never the louder partner — naming a thing larger than its prose is ratified", () => {
  expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, isHeading: true }])).toEqual([]);
  for (const voice of ["label", "kicker", "interactiveKicker", "credit"]) {
    expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, voice }]), `${voice} exists to name the thing beside it`).toEqual([]);
  }
});

test("a partner inside one ramp step is not an inversion — the floor is a real step, not a rounding difference", () => {
  expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, fontSizePx: 11.5 }])).toEqual([]);
  expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, fontSizePx: 13 }]).map((f) => f.rule)).toEqual(["caveat-outweighed"]);
});

test("a compressed size spread fires flat-type-hierarchy; the real ramp spread passes", () => {
  const flat = checkFontCensus({ families: [], sizes: [12, 13, 14] });
  expect(flat.map((f) => f.rule)).toContain("flat-type-hierarchy");
  const ramp = checkFontCensus({ families: [], sizes: [10.5, 13, 15, 24] });
  expect(ramp).toEqual([]);
});

// ── duplicate-action-door: which repetitions are HOMES (#252 · #851) ─────────
// The walker hands over one row per offered named control; this function decides how many HOMES they
// amount to. Outside a list a home is a distinct structural path. Inside a list the ROWS answer instead
// (#851): a transcript row that wraps its subtree conditionally (`theme-scope` on a themed speaker,
// `message-content-column` otherwise) produced two paths for one per-row action, and the rule fired on
// every virtualized list at coarse pointer — where every row's action cluster is permanent rather than
// hover-revealed, so two rows' doors are on one plane at once.

/** A door as the walker emits it; `list`/`item` default to the not-in-a-list case. */
function door(selector: string, path: string, list: string | null = null, item: string | null = null): ActionDoorInput {
  return { selector, role: "button", name: "more message actions", path, listKey: list, itemKey: item };
}

test("#851: sibling rows of one list are ONE home even when their subtrees diverge", () => {
  // The live shape: three message rows of one <ol>, two reaching the button through `theme-scope` and one
  // through `message-content-column`.
  const findings = checkDuplicateDoors([
    door("#a", "button<row<theme-scope<li", "list-1", "row-1"),
    door("#b", "button<row<content-column<li", "list-1", "row-2"),
    door("#c", "button<row<theme-scope<li", "list-1", "row-3"),
  ]);

  expect(findings, `one action cluster per row is per-datum repetition — got ${JSON.stringify(findings.map((f) => f.value))}`).toEqual([]);
});

test("#851: the fold is per LIST, not global — two homes in ONE row, and two doors outside any list, still fire", () => {
  const insideOneRow = checkDuplicateDoors([
    door("#header", "button<name-row<theme-scope<li", "list-1", "row-1"),
    door("#footer", "button<footer-row<theme-scope<li", "list-1", "row-1"),
    // A second row repeating the same pair adds rows, never homes.
    door("#header-2", "button<name-row<content-column<li", "list-1", "row-2"),
    door("#footer-2", "button<footer-row<content-column<li", "list-1", "row-2"),
  ]);
  expect(
    insideOneRow.map((f) => f.value),
    "one action offered twice inside a single card is a real duplicate door",
  ).toEqual(['2x button "more message actions"']);

  const twoLists = checkDuplicateDoors([door("#a", "button<row<li", "list-1", "row-1"), door("#b", "button<row<li", "list-2", "row-1")]);
  expect(
    twoLists.map((f) => f.value),
    "identity, not signature: two different lists that look alike are two homes",
  ).toEqual(['2x button "more message actions"']);

  const free = checkDuplicateDoors([door("#topbar", "button<header"), door("#tray", "button<footer")]);
  expect(
    free.map((f) => f.value),
    "a door outside any list is judged by its path exactly as before",
  ).toEqual(['2x button "more message actions"']);
});

// ── measured-spill pass-throughs (impeccable) ────────────────────────────────

test("text-overflow, repeated-container-text, clipped-overflow, and edge-flush-cards carry their fixed severities", () => {
  expect(checkTextOverflow({ selector: ".cell", spillPx: 45, mode: "inline" }).severity).toBe("P1");
  expect(checkRepeatedText({ containerSelector: ".card", text: "Active", count: 3, distinctSigs: 3 }).severity).toBe("P3");
  expect(checkClippedOverflow({ selector: ".row", childSelector: ".menu", flow: "positioned", side: null, spillPx: 0 }).severity).toBe("P2");
  expect(checkEdgeFlush({ scrollerSelector: ".strip", cardSelector: ".chip", edge: "right", gapPx: 2, count: 3 }).severity).toBe("P3");
});

// ── the two clipped-overflow arms (#444, paid for by #439) ───────────────────
// A positioned child that needs to escape a clip is a composition smell. An ordinary IN-FLOW control
// painted outside its container and cut is broken pixels — a first-timer reads "nk chat" as a rendering
// bug — so the arms carry different severities and different remedies, and the measured side + spill
// ride the value (the negative-side spill is what neither instrument could see at all).
test("the in-flow arm is a P1 naming the side and the spill; the positioned arm keeps its P2 and its remedy", () => {
  const inFlow = checkClippedOverflow({ selector: "div.dialog-surface", childSelector: "button", flow: "in-flow", side: "left", spillPx: 35 });
  expect(inFlow.severity).toBe("P1");
  expect(inFlow.value).toBe("clips button left by 35px");
  expect(inFlow.message).toContain("wrap");

  const positioned = checkClippedOverflow({ selector: ".row", childSelector: ".menu", flow: "positioned", side: "right", spillPx: 8 });
  expect(positioned.severity).toBe("P2");
  expect(positioned.value).toBe("clips .menu right by 8px");
  expect(positioned.message).toContain("portal it");
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
    // The silhouette lens is WIRED, not merely exported: the crescent geometry must reach the fan-out.
    controlAspects: [
      { selector: "[data-slot=switch-root]", role: "switch", width: 48, height: 44, animating: false },
      { selector: "[data-slot=switch-root]:nth-of-type(2)", role: "switch", width: 64, height: 44, animating: false },
    ],
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
  expect(rules).toEqual(["aria-name", "contrast", "control-aspect", "tap-target"]);
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

// ── CLI contract (tooling/src/ui-audit/cli.ts) ───────────────────────────────
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
  expect(parseAuditArgs(["--viewport", "1e3x768"]).errors).toContain('--viewport expects positive WxH, got "1e3x768"');
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
