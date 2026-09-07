// Fixture tests for the pure classify functions in tooling/src/ui-audit/lib — no
// browser needed (Spine-Testing.md §7: the vitest node lanes have no DOM). Each test hand-builds a
// DOM/CSSOM-like plain-data input (colors, sizes, booleans) exactly as the in-page walker would produce
// it, and asserts the SAME deterministic verdict a live page would get. Mirrors
// tests/tooling/trace-render.test.ts's approach to testing a scripts/ tool's pure core.
// The impeccable-adapted checks (origin "impeccable") each get a firing fixture AND a passing/exempt
// control — a green that cannot fail is not a fence.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import type { HoverContrastInput, HoverScanInput } from "../../../tooling/src/ui-audit/contract/samples-hover.ts";
import type {
  AccentBorderInput,
  ActionDoorInput,
  Backdrop,
  DesignAuditRuleId,
  Finding,
  IconTileInput,
  RawSamples,
  RulePopulationAccounting,
  TapTargetInput,
  TextStyleInput,
} from "../../../tooling/src/ui-audit/index.ts";
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
  checkDuplicateDoorPopulations,
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
  checkObscuredTarget,
  checkRadialGlow,
  checkRepeatedText,
  checkScriptErrors,
  checkStaleDuplicateDoorAllowances,
  checkTabIndexSmell,
  checkTapTarget,
  checkTapTargetPopulations,
  checkTextOverflow,
  checkTextStyle,
  checkTruncatedText,
  checkZIndex,
  classifyTextStyle,
  collectFindings,
  DESIGN_AUDIT_RULES,
  fontCensusPopulations,
  INTERACTIVE_TEXT_FLOOR_PX,
  isAtOrAboveSeverity,
  isValidSeverity,
  LEADING_FLOOR,
  LEADING_FLOOR_EPSILON,
  TEXT_MICRO_PX,
} from "../../../tooling/src/ui-audit/index.ts";
import { checkHoverContrast, hoverContrastPopulations } from "../../../tooling/src/ui-audit/lib/checks-hover.ts";
import { collectAudit } from "../../../tooling/src/ui-audit/lib/collect.ts";
import { populationEvidenceGap, settledPopulationAccounting } from "../../../tooling/src/ui-audit/lib/population.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const LIGHT_GRAY: Rgb = { r: 210, g: 210, b: 210 };
const FLAT_WHITE: Backdrop = { kind: "flat", color: WHITE };

interface AuditRuleProof {
  readonly rule: DesignAuditRuleId;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: () => void | Promise<void>): void {
  test(title, () => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn();
  });
}

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;
type ContrastSeverityIsOnlyP1 = Assert<Equal<Extract<Finding, { readonly rule: "contrast" }>["severity"], "P1">>;
const CONTRAST_SEVERITY_IS_ONLY_P1: ContrastSeverityIsOnlyP1 = true;

test("the design-audit rule denominator is closed at the 62 live ids", () => {
  expect(CONTRAST_SEVERITY_IS_ONLY_P1).toBe(true);
  expect(DESIGN_AUDIT_RULES).toHaveLength(62);
  expect(new Set(DESIGN_AUDIT_RULES.map((rule) => rule.id)).size).toBe(62);
  expect(DESIGN_AUDIT_RULES.filter((rule) => rule.id === "side-tab" || rule.id === "border-accent-on-rounded")).toHaveLength(2);
  expect(DESIGN_AUDIT_RULES.map(({ id, severity }) => `${id}:${severity.join("/")}`)).toEqual([
    "tap-target:P1/P2",
    "reveal-coverage:P3",
    "control-aspect:P2",
    "obscured-target:P0/P1",
    "aria-name:P1",
    "border-contrast:P2",
    "landmark-missing:P2",
    "tabindex-positive:P2",
    "skipped-heading:P2",
    "text-over-art:P0/P1",
    "contrast:P1",
    "hover-contrast:P1",
    "inactive-control-legibility:P3",
    "gray-on-color:P2",
    "border-accent-on-rounded:P3",
    "side-tab:P3",
    "glow-shadow:P3",
    "distorted-image:P1/P2",
    "canvas-ink:P3",
    "broken-image:P1",
    "radial-halo:P2",
    "radial-spotlight-glow:P3",
    "stripe-background:P3",
    "grid-line-background:P3",
    "icon-tile-stack:P3",
    "layout-transition:P3",
    "bounce-easing:P2",
    "text-overflow:P1",
    "truncated-to-nothing:P1",
    "repeated-container-text:P3",
    "clipped-overflow:P1/P2",
    "edge-flush-cards:P3",
    "script-error:P0",
    "duplicate-action-door:P3",
    "headline-overhang:P2",
    "inline-padding-leak:P1",
    "z-index-escalation:P2/P3",
    "nested-card:P3",
    "gradient-text:P3",
    "animated-img-hover:P3",
    "cohort-anatomy:P2",
    "row-void:P2",
    "selection-idiom:P2",
    "pane-ink:P3",
    "quiet-state:P2",
    "double-empty-state:P2",
    "text-below-ramp:P2",
    "undersized-ui-text:P2",
    "line-length:P3",
    "tight-leading:P3",
    "justified-text:P3",
    "all-caps-body:P3",
    "wide-tracking:P3",
    "crushed-tracking:P3",
    "caveat-outweighed:P2",
    "off-theme-font:P2",
    "flat-type-hierarchy:P3",
    "buried-raster:P1",
    "tier-drift:P2",
    "off-grid-text:P2",
    "promoted-layer-offset:P2",
    "off-grid-transform:P3",
  ]);
});

// ── #1 contrast ───────────────────────────────────────────────────────────────

auditRuleTest(
  [{ rule: "contrast", kind: "fires", reason: "light gray normal text on white emits" }],
  "a low-contrast pair (light gray on white, normal text) FAILs",
  () => {
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
  },
);

auditRuleTest(
  [{ rule: "contrast", kind: "silent", reason: "black normal text on the same backdrop stays clean" }],
  "a passing pair (black on white, normal text) reports no finding",
  () => {
    const finding = checkContrast({
      selector: ".body",
      color: BLACK,
      backdrop: FLAT_WHITE,
      fontSizePx: 14,
      fontWeight: 400,
    });
    expect(finding).toBeNull();
  },
);

auditRuleTest(
  [
    { rule: "inactive-control-legibility", kind: "fires", reason: "visually lost aria-disabled control emits the advisory" },
    { rule: "inactive-control-legibility", kind: "silent", reason: "the same inactive control above the UI-component floor stays clean" },
  ],
  "inactive controls use their rule-specific P3 advisory and preserve the legal neighbour",
  () => {
    const base = { selector: "button.save", backdrop: FLAT_WHITE, fontSizePx: 14, fontWeight: 400, inactive: "aria" as const };
    expect(checkContrast({ ...base, color: { r: 220, g: 220, b: 220 } })?.rule).toBe("inactive-control-legibility");
    expect(checkContrast({ ...base, color: BLACK })).toBeNull();
  },
);

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

auditRuleTest(
  [{ rule: "text-over-art", kind: "fires", reason: "indeterminate art backdrop emits" }],
  "text over a background-image with no flat/gradient color is indeterminate and FAILs at P1",
  () => {
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
  },
);

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

auditRuleTest(
  [{ rule: "text-over-art", kind: "silent", reason: "every-stop passing gradient is the nearest measurable neighbour" }],
  "text over a gradient passes when EVERY stop clears the ratio",
  () => {
    const finding = checkContrast({
      selector: ".banner-title",
      color: WHITE,
      backdrop: { kind: "gradient", stops: [BLACK, { r: 20, g: 20, b: 20 }] },
      fontSizePx: 24,
      fontWeight: 700,
    });
    expect(finding).toBeNull();
  },
);

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

auditRuleTest(
  [{ rule: "gray-on-color", kind: "fires", reason: "neutral text on a saturated backdrop emits" }],
  "gray text on a saturated colored background fires gray-on-color at P2",
  () => {
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
  },
);

auditRuleTest(
  [{ rule: "gray-on-color", kind: "silent", reason: "neutral backdrop and chromatic text are nearest legal neighbours" }],
  "gray-on-color stays quiet on a neutral background and for chromatic text",
  () => {
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
  },
);

// ── #3 distorted image ───────────────────────────────────────────────────────

auditRuleTest(
  [{ rule: "distorted-image", kind: "fires", reason: "object-fit fill with aspect deviation emits" }],
  "a stretched image (rendered aspect far from natural, object-fit: fill) FAILs",
  () => {
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
  },
);

auditRuleTest(
  [{ rule: "distorted-image", kind: "silent", reason: "object-fit cover with the same mismatch is legitimate cropping" }],
  "a cover-fit image with the same aspect mismatch passes (cropping is not stretching)",
  () => {
    const finding = checkImageDistortion({
      selector: "img.banner",
      naturalWidth: 1200,
      naturalHeight: 400,
      renderedWidth: 600,
      renderedHeight: 600,
      objectFit: "cover",
    });
    expect(finding).toBeNull();
  },
);

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

auditRuleTest([{ rule: "broken-image", kind: "fires", reason: "both walker failure reasons emit" }], "a broken image fires at P1 for both reasons", () => {
  expect(checkBrokenImage({ selector: "img.avatar", reason: "failed-load" }).severity).toBe("P1");
  expect(checkBrokenImage({ selector: "img.empty", reason: "empty-src" }).rule).toBe("broken-image");
});

// ── #4 tap targets (pointer-conditional floor) ───────────────────────────────

auditRuleTest(
  [{ rule: "tap-target", kind: "fires", reason: "undersized coarse pointer fixture emits" }],
  "coarse pointer: a <44px target (short side 40px, still >=32px) WARNs at P2",
  () => {
    const finding = checkTapTarget({ selector: "button.icon", width: 40, height: 40 }, true);
    expect(finding).not.toBeNull();
    expect(finding?.severity).toBe("P2");
  },
);

test("coarse pointer: a target below the 32px hard floor FAILs at P1", () => {
  const finding = checkTapTarget({ selector: "button.tiny", width: 24, height: 24 }, true);
  expect(finding?.severity).toBe("P1");
});

auditRuleTest(
  [{ rule: "tap-target", kind: "silent", reason: "the same control at the ratified pointer floor stays clean" }],
  "coarse pointer: a target at/above 44px reports no finding",
  () => {
    const finding = checkTapTarget({ selector: "button.big", width: 48, height: 48 }, true);
    expect(finding).toBeNull();
  },
);

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

// #1381: the priced sub-floor ruling lived only in a source comment (`@sub-floor-ok`), which no DOM
// walker can read, so two independent cold audits of /chats filed the same P1 hours apart. The control
// now DECLARES it (`data-target-floor="sub-floor-ok"`), and the rule honours the declaration at FINE
// pointer only — the arm below where it must NOT is the whole reason this is a ruling and not a mute.
test("a rendered sub-floor ruling excludes the candidate at FINE pointer and still FAILS at coarse", () => {
  const ruled = { selector: "[data-slot=collapsible-trigger]", width: 406, height: 16, ruledTargetFloor: "sub-floor-ok" } as const;

  expect(checkTapTarget(ruled, false)).toBeNull();
  // THE CONTROL. Coarse is reachability, not density: the ruling does not reach it, and the fragment that
  // carries the 44px floor there must still be provable by a regression.
  expect(checkTapTarget(ruled, true)?.severity).toBe("P1");
  // An undeclared control of the same geometry is untouched, so the exclusion is the DECLARATION's doing.
  expect(checkTapTarget({ selector: "[data-slot=collapsible-trigger]", width: 406, height: 16 }, false)?.severity).toBe("P1");
  // A declaration this rule does not recognise is not a wildcard mute.
  expect(checkTapTarget({ ...ruled, ruledTargetFloor: "whatever" }, false)?.severity).toBe("P1");
});

test("the ruled candidate is EXCLUDED with a named reason, never a silent skip", () => {
  const identity = {
    targetId: "trigger",
    ancestorTargetIds: [],
    authoredTarget: "button|slot=collapsible-trigger|role=|type=",
    authoredHome: "div@turn-footer",
  };
  const result = checkTapTargetPopulations(
    [{ ...identity, selector: "[data-slot=collapsible-trigger]", width: 406, height: 16, ruledTargetFloor: "sub-floor-ok" }],
    false,
  );

  expect(result.findings).toHaveLength(0);
  // candidates still counts it — the denominator names every control the walk offered.
  expect(result.accounting).toMatchObject({ candidates: 1, judged: 0, affected: 0, excluded: { ruledSubFloor: 1 } });
});

test("the PRINTED denominator excludes the ruled control too — the row and the accounting cannot disagree", () => {
  // #1566: only `checkTapTargetPopulations` subtracted the exclusion. `targetPopulationFindings` computed
  // its per-group `measured` set from `extentTruncated` alone, so a group holding one ruled control beside
  // two failing ones printed "2 affected of 3 judged" next to `judged=2 … excluded(ruledSubFloor=1)` —
  // the same run stating two different denominators, and the one a reader ACTS on was the wrong one.
  const home = { authoredTarget: "button|slot=collapsible-trigger|role=|type=", authoredHome: "div@turn-footer" };
  const member = (targetId: string, over: Partial<TapTargetInput> = {}): TapTargetInput => ({
    ...home,
    targetId,
    ancestorTargetIds: [],
    selector: `[data-target=${targetId}]`,
    width: 406,
    height: 16,
    ...over,
  });
  const result = checkTapTargetPopulations([member("a"), member("b"), member("ruled", { ruledTargetFloor: "sub-floor-ok" })], false);

  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.value).toContain("2 affected of 2 judged");
  expect(result.findings[0]?.population).toMatchObject({ affected: 2, judged: 2 });
  // …and the two readings agree: `judged` here is the same number the accounting publishes.
  expect(result.accounting).toMatchObject({ candidates: 3, judged: 2, affected: 2, excluded: { ruledSubFloor: 1 } });
});

test("tap-target populations collapse siblings, suppress nested owners, and preserve distinct homes", () => {
  const target = (targetId: string, home: string, ancestorTargetIds: readonly string[] = []): TapTargetInput => ({
    targetId,
    ancestorTargetIds,
    authoredTarget: "button|slot=tracker-value-rest|role=|type=",
    authoredHome: home,
    selector: `[data-target=${targetId}]`,
    width: 18,
    height: 18,
  });
  const result = checkTapTargetPopulations(
    [
      target("outer", "section@card-header"),
      target("nested", "section@card-header", ["outer"]),
      target("header-2", "section@card-header"),
      target("header-3", "section@card-header"),
      target("meter-1", "div@meter-row"),
      target("meter-2", "div@meter-row"),
    ],
    false,
  );
  expect(result.findings).toHaveLength(2);
  expect(result.findings.map((finding) => finding.population?.affected).sort()).toEqual([2, 3]);
  expect(result.accounting).toMatchObject({
    candidates: 6,
    judged: 6,
    affected: 6,
    populations: 2,
    emitted: 5,
    withheld: { extentTruncated: 0, cap: 0 },
    collapsed: { sameOwner: 1 },
  });
});

test("tap-target populations keep a distinct nested authored action visible", () => {
  const result = checkTapTargetPopulations(
    [
      {
        targetId: "outer",
        ancestorTargetIds: [],
        authoredTarget: "div|slot=clickable-card|role=button|type=",
        authoredHome: "section@library",
        selector: "[data-slot=clickable-card]",
        width: 18,
        height: 18,
      },
      {
        targetId: "inner",
        ancestorTargetIds: ["outer"],
        authoredTarget: "button|slot=row-actions|role=|type=",
        authoredHome: "div@clickable-card",
        selector: "[data-slot=row-actions]",
        width: 18,
        height: 18,
      },
    ],
    false,
  );
  expect(result.findings).toHaveLength(2);
  expect(result.accounting).toMatchObject({ affected: 2, emitted: 2, collapsed: { sameOwner: 0 } });
});

test("tap-target representative capping never truncates the affected or judged denominator", () => {
  const samples = Array.from({ length: 9 }, (_unused, index) => ({
    targetId: `target-${String(index)}`,
    ancestorTargetIds: [],
    authoredTarget: "button|slot=tracker-value-rest|role=|type=",
    authoredHome: "div@meter-row",
    selector: `[data-target='${String(index)}']`,
    width: 18,
    height: 18,
  }));
  const result = checkTapTargetPopulations(samples, false);
  expect(result.findings[0]?.population).toEqual({ affected: 9, judged: 9, capped: 4 });
  expect(result.findings[0]?.representatives).toHaveLength(5);
  expect(result.accounting.withheld["cap"]).toBe(4);
});

test("a partially-instrumented tap-target population fails loud instead of mixing grouped and legacy rows", () => {
  expect(() =>
    checkTapTargetPopulations(
      [
        {
          targetId: "instrumented",
          ancestorTargetIds: [],
          authoredTarget: "button|slot=button|role=|type=",
          authoredHome: "section@toolbar",
          selector: "button.instrumented",
          width: 18,
          height: 18,
        },
        { selector: "button.blind", width: 18, height: 18 },
      ],
      false,
    ),
  ).toThrow("INSTRUMENT ERROR: tap-target identity is partial (1/2)");
});

// ── #4b control silhouette (#430, from side-eye #420) ────────────────────────
// The founding numbers are LIVE MEASUREMENTS, not invented fixtures
// (docs/history/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md, "Measured geometry"):
// the shipped coarse Switch was 48x44 (aspect 1.091, read as a crescent moon) and the fix is 64x44
// (aspect 1.455). Each carve below carries the reason it exists AND its passing control.
const SWITCH_SAMPLE = { selector: "[data-slot=switch-root]", role: "switch", animating: false };

auditRuleTest(
  [{ rule: "control-aspect", kind: "fires", reason: "the pre-fix 48x44 switch fixture emits" }],
  "the pre-#420 coarse Switch geometry (48x44, aspect 1.09) FIRES — the defect this rule exists for",
  () => {
    const finding = checkControlAspect({ ...SWITCH_SAMPLE, width: 48, height: 44 });
    expect(finding?.rule).toBe("control-aspect");
    expect(finding?.severity).toBe("P2");
    expect(finding?.value, "the finding must publish the measured aspect, not just a verdict").toContain("1.09");
    expect(finding?.value).toContain("48×44px");
  },
);

auditRuleTest(
  [{ rule: "control-aspect", kind: "silent", reason: "the shipped 64x44 switch is the nearest legal geometry" }],
  "the shipped fix (64x44, aspect 1.455) is CLEAN — the twin that makes the red above a plant",
  () => {
    expect(checkControlAspect({ ...SWITCH_SAMPLE, width: 64, height: 44 })).toBeNull();
  },
);

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

auditRuleTest(
  [{ rule: "aria-name", kind: "fires", reason: "the unlabeled icon button fixture emits" }],
  "an unlabeled icon-button (no text, no aria-label/title/alt) FAILs",
  () => {
    const finding = checkAccessibleName({
      selector: "button.icon-close",
      tag: "button",
      hasVisibleText: false,
      ariaLabel: null,
      ariaLabelledbyText: null,
      nativeLabelText: null,
      title: null,
      altText: null,
    });
    expect(finding).not.toBeNull();
    expect(finding?.rule).toBe("aria-name");
    expect(finding?.severity).toBe("P1");
  },
);

auditRuleTest(
  [{ rule: "aria-name", kind: "silent", reason: "the same button with an aria-label stays clean" }],
  "a labeled icon-button (aria-label set) passes",
  () => {
    const finding = checkAccessibleName({
      selector: "button.icon-close",
      tag: "button",
      hasVisibleText: false,
      ariaLabel: "Close dialog",
      ariaLabelledbyText: null,
      nativeLabelText: null,
      title: null,
      altText: null,
    });
    expect(finding).toBeNull();
  },
);

test("visible text alone is enough to satisfy the accessible-name check", () => {
  const finding = checkAccessibleName({
    selector: "button.save",
    tag: "button",
    hasVisibleText: true,
    ariaLabel: null,
    ariaLabelledbyText: null,
    nativeLabelText: null,
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
    nativeLabelText: null,
    title: null,
    altText: null,
  });
  expect(finding).not.toBeNull();
});

auditRuleTest([{ rule: "landmark-missing", kind: "fires", reason: "the missing-main fixture emits" }], "a missing <main> landmark reports a P2 finding", () => {
  expect(checkMainLandmark({ main: false })).not.toBeNull();
});

auditRuleTest(
  [{ rule: "landmark-missing", kind: "silent", reason: "the same page sample with main present stays clean" }],
  "a present <main> landmark reports no finding",
  () => {
    expect(checkMainLandmark({ main: true })).toBeNull();
  },
);

auditRuleTest(
  [{ rule: "tabindex-positive", kind: "fires", reason: "tabindex one emits" }],
  "a positive tabindex is flagged (breaks natural DOM tab order)",
  () => {
    const finding = checkTabIndexSmell({ selector: "div.weird", tabIndex: 5 });
    expect(finding).not.toBeNull();
    expect(finding?.rule).toBe("tabindex-positive");
  },
);

auditRuleTest(
  [{ rule: "tabindex-positive", kind: "silent", reason: "zero and minus one preserve natural order" }],
  "tabindex=0 and tabindex=-1 are both fine (not a smell)",
  () => {
    expect(checkTabIndexSmell({ selector: "div.a", tabIndex: 0 })).toBeNull();
    expect(checkTabIndexSmell({ selector: "div.b", tabIndex: -1 })).toBeNull();
  },
);

// ── heading order (impeccable; N7) ───────────────────────────────────────────

auditRuleTest(
  [
    { rule: "skipped-heading", kind: "fires", reason: "the h1 to h3 fixture emits" },
    { rule: "skipped-heading", kind: "silent", reason: "the adjacent heading descent is the nearest legal neighbour" },
  ],
  "an h1→h3 skip fires skipped-heading at P2 against the OFFENDING element; a clean descent passes",
  () => {
    const skipped = checkHeadingOrder([
      { selector: "main > section:nth-of-type(1) > h1", level: 1, text: "Library" },
      { selector: "main > section:nth-of-type(2) > h3", level: 3, text: "Recent" },
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.rule).toBe("skipped-heading");
    expect(skipped[0]?.severity).toBe("P2");
    // #1317 item 5 — cli.ts's own law: every finding carries a LOCATABLE selector. This one used to
    // report the TAG (`h3`), which addresses nothing on a page with more than one h3.
    expect(skipped[0]?.selector).toBe("main > section:nth-of-type(2) > h3");
    const clean = checkHeadingOrder([
      { selector: "h1", level: 1, text: "Library" },
      { selector: "h2", level: 2, text: "Recent" },
      { selector: "h3", level: 3, text: "Today" },
      { selector: "h2:nth-of-type(2)", level: 2, text: "Archive" },
    ]);
    expect(clean).toEqual([]);
  },
);

// ── #6 cheap in-DOM antipatterns ─────────────────────────────────────────────

auditRuleTest(
  [
    { rule: "z-index-escalation", kind: "fires", reason: "z-index at the escalation floor emits" },
    { rule: "z-index-escalation", kind: "silent", reason: "a value below the floor stays clean" },
  ],
  "z-index >= 999 is flagged; below it is not",
  () => {
    expect(checkZIndex({ selector: ".modal", zIndex: 1000 })?.rule).toBe("z-index-escalation");
    expect(checkZIndex({ selector: ".panel", zIndex: 50 })).toBeNull();
  },
);

test("an egregious z-index (>=9999) escalates to P2 over the default P3", () => {
  expect(checkZIndex({ selector: ".x", zIndex: 999 })?.severity).toBe("P3");
  expect(checkZIndex({ selector: ".y", zIndex: 99_999 })?.severity).toBe("P2");
});

auditRuleTest(
  [
    { rule: "nested-card", kind: "fires", reason: "a card inside a card emits" },
    { rule: "nested-card", kind: "silent", reason: "the otherwise identical non-nested card stays clean" },
  ],
  "a nested card is flagged; a non-nested one is not",
  () => {
    expect(checkNestedCard({ selector: ".inner-card", isNested: true })?.rule).toBe("nested-card");
    expect(checkNestedCard({ selector: ".card", isNested: false })).toBeNull();
  },
);

auditRuleTest(
  [
    { rule: "gradient-text", kind: "fires", reason: "background-clipped text emits" },
    { rule: "gradient-text", kind: "silent", reason: "plain text without clipping stays clean" },
  ],
  "gradient-clipped text is flagged; plain text is not",
  () => {
    expect(checkGradientText({ selector: ".hero-h1", hasGradientText: true })?.rule).toBe("gradient-text");
    expect(checkGradientText({ selector: ".body", hasGradientText: false })).toBeNull();
  },
);

auditRuleTest(
  [
    { rule: "animated-img-hover", kind: "fires", reason: "a transformed image hover emits" },
    { rule: "animated-img-hover", kind: "silent", reason: "the otherwise identical static image stays clean" },
  ],
  "an <img> with a hover transform is flagged; a static one is not",
  () => {
    expect(checkAnimatedImgHover({ selector: "img.card-art", hasHoverAnimation: true })?.rule).toBe("animated-img-hover");
    expect(checkAnimatedImgHover({ selector: "img.static", hasHoverAnimation: false })).toBeNull();
  },
);

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

auditRuleTest(
  [
    { rule: "text-below-ramp", kind: "fires", reason: "text below the micro token emits" },
    { rule: "text-below-ramp", kind: "silent", reason: "text exactly at the ratified micro token stays clean" },
  ],
  "text below the ratified micro step fires text-below-ramp at P2; AT the micro step it passes",
  () => {
    const below = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 9 });
    expect(below.map((f) => f.rule)).toContain("text-below-ramp");
    const atMicro = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: TEXT_MICRO_PX });
    expect(atMicro.map((f) => f.rule)).not.toContain("text-below-ramp");
  },
);

auditRuleTest(
  [
    { rule: "undersized-ui-text", kind: "fires", reason: "interactive micro text below eleven pixels emits" },
    { rule: "undersized-ui-text", kind: "silent", reason: "interactive text at the floor is covered by the adjacent control fixture" },
  ],
  "interactive text below 11px fires undersized-ui-text even at the micro token (ramp doesn't launder controls)",
  () => {
    const atMicroInteractive = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: TEXT_MICRO_PX, interactive: true });
    expect(TEXT_MICRO_PX).toBeLessThan(INTERACTIVE_TEXT_FLOOR_PX); // the premise this test rests on
    expect(atMicroInteractive.map((f) => f.rule)).toContain("undersized-ui-text");
    // Below the ramp, only text-below-ramp fires — the two floors never double-flag one element.
    const belowBoth = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 9, interactive: true });
    expect(belowBoth.map((f) => f.rule)).toContain("text-below-ramp");
    expect(belowBoth.map((f) => f.rule)).not.toContain("undersized-ui-text");
    expect(checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: INTERACTIVE_TEXT_FLOOR_PX, interactive: true }).map((f) => f.rule)).not.toContain(
      "undersized-ui-text",
    );
  },
);

auditRuleTest(
  [{ rule: "undersized-ui-text", kind: "fires", reason: "the fold's BOUNDARY — what must not fold, and what happens without identity" }],
  "only the SIZE floors fold: a per-element copy rule stays per-element, and no identity means no grouping",
  () => {
    // main's own test pins the fold and the anti-collapse control (a different authored home stays a
    // separate row) plus the accounting. These two cases pin the fold's BOUNDARY instead — the part
    // most likely to regress if someone widens the grouped-rule set.
    const identity = { authoredTarget: "span|slot=text|role=|type=", authoredHome: "button@style-option::span<button" };

    // (1) A per-element COPY rule must not fold. all-caps-body judges THIS node's own text, and two
    // renders of one component can legitimately differ on it.
    const longCaps = { ...TEXT_STYLE_BASE, ...identity, directTextLen: 60, textTransform: "uppercase" };
    const caps = collectFindings({
      ...EMPTY_SAMPLES,
      textStyles: [
        { ...longCaps, selector: "p:nth-of-type(1)" },
        { ...longCaps, selector: "p:nth-of-type(2)" },
      ],
    }).filter(({ rule }) => rule === "all-caps-body");
    expect(caps).toHaveLength(2);

    // (2) A sample bundle with NO authored identity keeps the historic one-row-per-element contract.
    // The decision key falls back to the SELECTOR on both halves, which can never collide — so an
    // un-instrumented walker degrades to the old behaviour instead of collapsing unrelated elements.
    const small = { ...TEXT_STYLE_BASE, fontSizePx: 10.5, interactive: true };
    const legacy = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ ...small, selector: `button:nth-of-type(${String(n)}) > span` }));
    expect(collectFindings({ ...EMPTY_SAMPLES, textStyles: legacy }).filter(({ rule }) => rule === "undersized-ui-text")).toHaveLength(8);
  },
);

test("code contexts and sr-only text are exempt from the type floors", () => {
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 8, codeContext: true }).map((f) => f.rule)).not.toContain("text-below-ramp");
  expect(checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 8, srOnly: true })).toEqual([]);
});
// #464 (kept, because it is the FIRST half of the same lesson): this rule once divided by a GUESSED
// character width (fontSize × 0.5), so every measure came out ~15% long and it filed an "86 chars" P3
// against a paragraph that was 75.0 CSS ch — the house's own ratified measure at the time. The fix was to
// MEASURE the denominator instead of guessing it. #1183 is the second half: measuring the wrong denominator
// is the same defect wearing a receipt.
//
// #1183/#1145 — THE TWO UNITS. `ch` is the '0' advance (0.6625em in Geist); a character of running prose
// averages ~0.44em, so one CSS ch is ~1.5 law-characters and the SAME BOX has two legitimate numbers. The
// pair below is measured Geist at 15px: 9.94px per `ch`, 6.6px per average glyph. Every arm here pins which
// unit its ceiling is in, because the whole #1183 defect was a law-character ceiling compared to a `ch`
// count — 75ch read as "75", passed, and the paragraph was 117 characters wide.
const GEIST_CH_15PX_TRUE = 9.94;
const GEIST_GLYPH_15PX = 6.6;

auditRuleTest(
  [
    { rule: "line-length", kind: "fires", reason: "measured over-wide prose emits" },
    { rule: "line-length", kind: "silent", reason: "normal prose measure stays clean" },
  ],
  "an over-wide prose block fires line-length; a normal measure passes",
  () => {
    // 900px / 6.6px ≈ 136 law-characters — well past the 80 ceiling.
    const wide = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 900, glyphAdvancePx: GEIST_GLYPH_15PX });
    expect(wide.map((f) => f.rule)).toContain("line-length");
    // 47ch at 15px Geist = 467px = ~71 law-characters: the ratified PROSE measure, and it must stay clean.
    const normal = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 47 * GEIST_CH_15PX_TRUE, glyphAdvancePx: GEIST_GLYPH_15PX });
    expect(normal.map((f) => f.rule)).not.toContain("line-length");
  },
);

// #464's ruling SURVIVES — ITS INPUT CHANGED (owner ruling 2026-09-02, #1145). "The instrument may not
// indict the ratified measure" is still law; what moved is WHICH token is ratified for WHICH surface. The
// transcript keeps `--reading-measure: 75ch` and is judged in `ch`, so the original pin holds verbatim in
// that arm. Everything else takes `--reading-measure-prose: 47ch`, so a 75ch TEACHING paragraph is 117
// law-characters and IS the finding — the exact paragraph #1183 was filed over.
test("the 75ch transcript measure stays clean, while the same box as PROSE fires at its real character count", () => {
  const box = 75 * GEIST_CH_15PX_TRUE;
  const transcript = checkTextStyle({
    ...TEXT_STYLE_BASE,
    totalTextLen: 200,
    rectWidth: box,
    chWidthPx: GEIST_CH_15PX_TRUE,
    glyphAdvancePx: GEIST_GLYPH_15PX,
    readingSurface: true,
  });
  expect(
    transcript.map((f) => f.rule),
    "a message bubble at its own ratified token is not a finding (#464's surviving half)",
  ).not.toContain("line-length");

  const prose = checkTextStyle({
    ...TEXT_STYLE_BASE,
    totalTextLen: 200,
    rectWidth: box,
    chWidthPx: GEIST_CH_15PX_TRUE,
    glyphAdvancePx: GEIST_GLYPH_15PX,
  }).find((f) => f.rule === "line-length");
  expect(prose, "a 75ch teaching paragraph is 113 characters — the #1183 blindness").toBeDefined();
  expect(prose?.value, "BOTH units print, because confusing them is the defect").toBe("113 characters (75 CSS ch)/line");
});

test("line-length reports REAL characters, and refuses a verdict when the advance was not measured", () => {
  const measured = checkTextStyle({
    ...TEXT_STYLE_BASE,
    totalTextLen: 200,
    rectWidth: 100 * GEIST_GLYPH_15PX,
    glyphAdvancePx: GEIST_GLYPH_15PX,
  }).find((f) => f.rule === "line-length");
  expect(measured?.value).toContain("100 characters");

  // A zero advance is "the canvas refused", not "a narrow line" — a bare number from an unmeasured
  // instrument is exactly the class of lie this fix exists to stop.
  const unmeasured = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 5000, glyphAdvancePx: 0 });
  expect(unmeasured.map((f) => f.rule)).not.toContain("line-length");
  // …and the transcript arm refuses on ITS OWN denominator: a measured glyph advance does not license a
  // verdict about a box whose `ch` advance was never read.
  const transcriptUnmeasured = checkTextStyle({
    ...TEXT_STYLE_BASE,
    totalTextLen: 200,
    rectWidth: 5000,
    chWidthPx: 0,
    glyphAdvancePx: GEIST_GLYPH_15PX,
    readingSurface: true,
  });
  expect(transcriptUnmeasured.map((f) => f.rule)).not.toContain("line-length");
});

// #1183 — THE POPULATION, not just the ceiling. `<Text as="span" voice="gloss">` is a settings-row
// description: prose by the reading-surface law, invisible to a prose-TAG census, and 55 of 64 samples on
// the surface that produced the row left as `notProseTag`.
test("a prose VOICE on a non-prose tag is judged, and an authored chrome voice is excluded by its own name", () => {
  const wide = { ...TEXT_STYLE_BASE, tag: "span", isProseTag: false, totalTextLen: 200, rectWidth: 900, glyphAdvancePx: GEIST_GLYPH_15PX };

  expect(
    checkTextStyle({ ...wide, ownVoice: "gloss" }).map((f) => f.rule),
    "a gloss is copy a user reads in lines",
  ).toContain("line-length");
  expect(checkTextStyle({ ...wide, ownVoice: "reading" }).map((f) => f.rule)).toContain("line-length");
  expect(checkTextStyle({ ...wide, ownVoice: "quiet" }).map((f) => f.rule)).toContain("line-length");
  // The population did not widen to everything: a datum's label is chrome, not a reading measure.
  expect(checkTextStyle({ ...wide, ownVoice: "label" }).map((f) => f.rule)).not.toContain("line-length");
  expect(checkTextStyle({ ...wide, ownVoice: "kicker" }).map((f) => f.rule)).not.toContain("line-length");

  expect(classifyTextStyle({ ...wide, ownVoice: "label" }, "line-length")).toEqual({ kind: "excluded", reason: "chromeVoice" });
  expect(classifyTextStyle({ ...wide, ownVoice: "" }, "line-length")).toEqual({ kind: "excluded", reason: "notProseTag" });
  expect(classifyTextStyle({ ...wide, ownVoice: "gloss" }, "line-length").kind).toBe("judged");
});

test("each measure arm withholds under its OWN name, so a blind denominator is nameable", () => {
  const base = { ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 900 };
  expect(classifyTextStyle({ ...base, glyphAdvancePx: 0 }, "line-length")).toEqual({ kind: "withheld", reason: "glyphAdvanceUnmeasured" });
  expect(classifyTextStyle({ ...base, chWidthPx: 0, readingSurface: true }, "line-length")).toEqual({
    kind: "withheld",
    reason: "chAdvanceUnmeasured",
  });
});

test("tracking counts toward the measure — a tracked line fits fewer characters than its glyph count", () => {
  const tracked = checkTextStyle({
    ...TEXT_STYLE_BASE,
    totalTextLen: 200,
    rectWidth: 85 * GEIST_GLYPH_15PX,
    glyphAdvancePx: GEIST_GLYPH_15PX,
    letterSpacingPx: 2,
  });
  const untracked = checkTextStyle({ ...TEXT_STYLE_BASE, totalTextLen: 200, rectWidth: 85 * GEIST_GLYPH_15PX, glyphAdvancePx: GEIST_GLYPH_15PX });

  expect(
    untracked.map((f) => f.rule),
    "85 bare law-characters is past the 80 ceiling",
  ).toContain("line-length");
  expect(
    tracked.map((f) => f.rule),
    "the same box with 2px tracking fits ~65 glyphs — not an over-long line",
  ).not.toContain("line-length");
});

auditRuleTest(
  [
    { rule: "tight-leading", kind: "fires", reason: "leading below the ratified ratio emits" },
    { rule: "tight-leading", kind: "silent", reason: "leading exactly at the floor stays clean" },
  ],
  "leading below the ratified floor fires tight-leading; AT the floor (leading.label) it is legal",
  () => {
    const tight = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 15, lineHeightPx: 16.5 }); // 1.1×
    expect(tight.map((f) => f.rule)).toContain("tight-leading");
    const atFloor = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 16, lineHeightPx: 16 * LEADING_FLOOR });
    expect(atFloor.map((f) => f.rule)).not.toContain("tight-leading");
  },
);

// #233, home-delta 2026-08-18: three of the reading arm's findings were THIS false positive, and the
// finding printed its own refutation ("line-height 1.25× (floor 1.25)"). At --font-scale 1.25 the body
// step computes to 13.125px and Chrome hands back a TRUNCATED line-height string ("16.4062px", not
// 16.40625) — 16.4062 / 13.125 = 1.2499657, a hair under the floor. The numbers below are the measured
// ones, not a synthetic epsilon: the fix must swallow Chrome's truncation and nothing wider.
test("a Chrome-truncated computed line-height AT the floor does not fire tight-leading (#233 float FP)", () => {
  const truncated = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 13.125, lineHeightPx: 16.4062 });
  expect(truncated.map((f) => f.rule)).not.toContain("tight-leading");
  // …and the epsilon stays a rounding allowance, not a weakened floor: genuinely tight leading still fires.
  // DERIVED from the floor, not spelled: this number was `1.24` while the floor was the unitless 1.25
  // token, and the integer-line-box change (docs/design/integer-line-boxes.md §3a) moved the floor to
  // 16/13 = 1.2308 — which makes 1.24 LEGAL leading and silently turned this arm into a test that could
  // only fail. A pin whose job is "one step under the floor" says that, so it survives the next ratified
  // move instead of encoding one era's number.
  const oneStepUnderFloor = LEADING_FLOOR - LEADING_FLOOR_EPSILON * 2;
  const genuinelyTight = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 13.125, lineHeightPx: 13.125 * oneStepUnderFloor });
  expect(genuinelyTight.map((f) => f.rule)).toContain("tight-leading");
});

auditRuleTest(
  [
    { rule: "justified-text", kind: "fires", reason: "justified prose without auto hyphens emits" },
    { rule: "justified-text", kind: "silent", reason: "the same prose with auto hyphens stays clean" },
  ],
  "justified text without hyphens fires; hyphens:auto passes",
  () => {
    expect(checkTextStyle({ ...TEXT_STYLE_BASE, textAlign: "justify" }).map((f) => f.rule)).toContain("justified-text");
    expect(checkTextStyle({ ...TEXT_STYLE_BASE, textAlign: "justify", hyphens: "auto" }).map((f) => f.rule)).not.toContain("justified-text");
  },
);

auditRuleTest(
  [
    { rule: "all-caps-body", kind: "fires", reason: "long uppercase running text emits" },
    { rule: "all-caps-body", kind: "silent", reason: "headings and short uppercase labels stay clean" },
  ],
  "long uppercase body fires all-caps-body; headings and short caps labels are exempt",
  () => {
    const caps = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 60 });
    expect(caps.map((f) => f.rule)).toContain("all-caps-body");
    const heading = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 60, isHeading: true });
    expect(heading.map((f) => f.rule)).not.toContain("all-caps-body");
    const shortLabel = checkTextStyle({ ...TEXT_STYLE_BASE, textTransform: "uppercase", directTextLen: 12 });
    expect(shortLabel.map((f) => f.rule)).not.toContain("all-caps-body");
  },
);

auditRuleTest(
  [
    { rule: "wide-tracking", kind: "fires", reason: "wide tracking on running text emits" },
    { rule: "wide-tracking", kind: "silent", reason: "the uppercase micro-caps voice is the nearest legitimate neighbour" },
  ],
  "wide tracking on running text fires; the uppercase micro-caps voice is exempt",
  () => {
    // 0.08em of tracking.micro on 15px text = 1.2px — over the 0.05em body gate.
    const wide = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2 });
    expect(wide.map((f) => f.rule)).toContain("wide-tracking");
    const caps = checkTextStyle({ ...TEXT_STYLE_BASE, letterSpacingPx: 1.2, textTransform: "uppercase", directTextLen: 25 });
    expect(caps.map((f) => f.rule)).not.toContain("wide-tracking");
  },
);

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

auditRuleTest(
  [
    { rule: "crushed-tracking", kind: "fires", reason: "tracking below the negative floor emits" },
    { rule: "crushed-tracking", kind: "silent", reason: "tracking exactly at the floor stays clean" },
  ],
  "crushed tracking fires strictly below the −0.04em floor; the floor itself is legal",
  () => {
    const crushed = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 20, letterSpacingPx: -1.0 }); // −0.05em
    expect(crushed.map((f) => f.rule)).toContain("crushed-tracking");
    const atFloor = checkTextStyle({ ...TEXT_STYLE_BASE, fontSizePx: 20, letterSpacingPx: -0.8 }); // −0.04em
    expect(atFloor.map((f) => f.rule)).not.toContain("crushed-tracking");
  },
);

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
  selectionRail: false,
  artPane: false,
};
const ACCENT_RED: Rgb = { r: 220, g: 40, b: 40, a: 1 };

auditRuleTest(
  [{ rule: "side-tab", kind: "fires", reason: "a thick dominant chromatic side edge emits" }],
  "a thick chromatic left border fires side-tab at P3",
  () => {
    const findings = checkAccentBorder({
      ...ACCENT_BASE,
      widths: { ...ACCENT_BASE.widths, left: 4 },
      colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
    });
    expect(findings.map((f) => f.rule)).toContain("side-tab");
    expect(findings[0]?.origin).toBe("impeccable");
  },
);

auditRuleTest(
  [{ rule: "side-tab", kind: "silent", reason: "a status edge and neutral border are nearest legitimate neighbours" }],
  "a status/alert region wearing a severity edge is exempt; a neutral border never fires",
  () => {
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
  },
);

auditRuleTest(
  [{ rule: "border-accent-on-rounded", kind: "fires", reason: "a dominant chromatic edge fighting a radius emits" }],
  "a thick chromatic top border on a rounded card fires border-accent-on-rounded; a tab underline is exempt",
  () => {
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
  },
);

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

auditRuleTest(
  [{ rule: "border-accent-on-rounded", kind: "silent", reason: "the selected selection-rail accent is the ratified nearest neighbour" }],
  "the ratified selection-rail accent is exempt, and neither half of the predicate exempts alone (issue #485)",
  () => {
    // OWNER RULED 2026-08-22: the selected-row left ember bar (a 2px `border-l-primary` on a rounded row) is
    // the app-wide selection idiom and stands as shipped. The `selectionRail` sample is the walker's
    // two-halved verdict — the primitive's own slot AND `data-selected` — and this is the check's half of
    // that contract: the flag exempts, and its absence leaves the identical geometry fully judged.
    const selectedRow = checkAccentBorder({
      ...ACCENT_BASE,
      selectionRail: true,
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
  },
);

auditRuleTest(
  [
    { rule: "side-tab", kind: "silent", reason: "inside an illustrated picker's art pane the stripe IS the subject of the picture" },
    { rule: "border-accent-on-rounded", kind: "silent", reason: "one aperture, one exemption for the whole accent-border family" },
  ],
  "an accent stripe inside an illustrated picker's ART PANE is exempt; the identical geometry outside stays judged (#1642)",
  () => {
    // The chat-style picker's mini transcript inherits the real skin's 3px accent through `stripeOf`
    // (appearance-chat-style-cards.tsx) so the reader can SEE the skin — the rule was reporting a tell in
    // a picture whose subject is that tell. Keyed on the shared `[data-slot=picker-cell-art]` aperture, so
    // the density and elevation diagram cells ride the same row.
    const inArt = checkAccentBorder({
      ...ACCENT_BASE,
      artPane: true,
      radius: 8,
      widths: { top: 1, right: 1, bottom: 1, left: 3 },
      colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
    });
    expect(inArt, "a diagram of a skin is not a card tell").toEqual([]);

    const outsideArt = checkAccentBorder({
      ...ACCENT_BASE,
      radius: 8,
      widths: { top: 1, right: 1, bottom: 1, left: 3 },
      colors: { ...ACCENT_BASE.colors, left: ACCENT_RED },
    }).map((f) => f.rule);
    expect(outsideArt, "the exemption is the FLAG, never the shape").toContain("side-tab");
    expect(outsideArt).toContain("border-accent-on-rounded");
  },
);

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

auditRuleTest(
  [{ rule: "glow-shadow", kind: "fires", reason: "a zero-offset chromatic halo emits" }],
  "a zero-offset chromatic halo fires glow-shadow on any backdrop",
  () => {
    const finding = checkGlowShadow({
      selector: ".cta",
      boxShadow: "rgb(59, 130, 246) 0px 0px 20px 0px",
      textShadow: "",
      backdropColor: WHITE,
    });
    expect(finding?.rule).toBe("glow-shadow");
    expect(finding?.severity).toBe("P3");
  },
);

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

auditRuleTest(
  [{ rule: "glow-shadow", kind: "silent", reason: "a neutral elevation shadow on the same surface stays clean" }],
  "neutral elevation shadows pass, and an UNRESOLVED value is skipped — but OKLCH is judged (2026-09-01)",
  () => {
    const neutral = checkGlowShadow({
      selector: ".card",
      boxShadow: "rgba(0, 0, 0, 0.3) 0px 4px 16px 0px",
      textShadow: "",
      backdropColor: { r: 10, g: 10, b: 12 },
    });
    expect(neutral).toBeNull();
    // THIS ASSERTION WAS INVERTED, AND THE INVERSION PINNED A DEAD RULE. It used to expect `null`
    // for an oklch zero-offset chromatic halo — in our own accent hue — under the name
    // "unparseable (oklch token)". OKLCH was never unparseable; the rule's hand-rolled
    // `rgba?\(…\)` regex simply could not spell it, and since our tokens are OKLCH-only and raw
    // colours are gate-RED at source, that made `glow-shadow` structurally incapable of firing on
    // anything this app can author. The old selector name (`.sanctioned`) shows the intent:
    // colour-blindness was standing in for an exemption `checkGlowShadow` does not have — only
    // `checkRadialGlow` takes a `sanctioned` flag. The sanctioned `--shadow-glow` rides a `::before`
    // LAYER, so an element whose OWN box-shadow carries an accent halo is the WCAG 2.4.7
    // focus-ring-clobbering defect the skill calls a P0 — exactly what this must now catch.
    const oklch = checkGlowShadow({
      selector: ".accent-halo-on-the-element-itself",
      boxShadow: "oklch(0.72 0.175 52 / 0.4) 0px 0px 18px 0px",
      textShadow: "",
      backdropColor: { r: 10, g: 10, b: 12 },
    });
    expect(oklch?.rule).toBe("glow-shadow");
    // What IS genuinely unreadable stays skipped: an unresolved var() has no channel to score.
    const unresolved = checkGlowShadow({
      selector: ".unresolved",
      boxShadow: "var(--shadow-glow) 0px 0px 18px 0px",
      textShadow: "",
      backdropColor: { r: 10, g: 10, b: 12 },
    });
    expect(unresolved).toBeNull();
  },
);

test("the walker's `sanctioned` verdict short-circuits an otherwise-firing glow, and only for that sample", () => {
  // The flag now carries TWO derivations (ops/walker/census-decor.ts): an owner effect carrier
  // (`SANCTIONED_GLOW_SEL`) and — for a `::before`/`::after` sample only — the house layered-glow
  // discipline. Both arrive here as one boolean on purpose; a parallel flag would be a second home for
  // one question. The derivation itself is pinned in ops/walker/census-glow.int.test.ts, where a real
  // browser can see a pseudo-element at all.
  const input = {
    selector: "#focal::before",
    boxShadow: "oklch(0.72 0.175 52 / 0.4) 0px 0px 18px 0px",
    textShadow: "",
    backdropColor: { r: 10, g: 10, b: 12 },
  } as const;
  expect(checkGlowShadow({ ...input, sanctioned: true })).toBeNull();
  expect(checkGlowShadow({ ...input, sanctioned: false })?.rule).toBe("glow-shadow");
});

// ── radial washes (impeccable radial-halo / radial-spotlight-glow) ───────────

auditRuleTest(
  [{ rule: "radial-halo", kind: "fires", reason: "a saturated radial wash fading to transparent emits" }],
  "a saturated radial wash fading to transparent fires radial-halo at P2",
  () => {
    const finding = checkRadialGlow({
      selector: ".hero",
      value: "radial-gradient(circle at 50% 30%, rgba(120, 60, 255, 0.8), transparent 70%)",
      width: 800,
      height: 400,
      sanctioned: false,
    });
    expect(finding?.rule).toBe("radial-halo");
    expect(finding?.severity).toBe("P2");
  },
);

auditRuleTest(
  [{ rule: "radial-spotlight-glow", kind: "fires", reason: "a low-alpha accent spotlight emits" }],
  "a low-alpha accent spotlight fires radial-spotlight-glow at P3",
  () => {
    const finding = checkRadialGlow({
      selector: ".section",
      value: "radial-gradient(circle at 52% 38%, rgba(80, 111, 255, 0.26), transparent 44%)",
      width: 600,
      height: 300,
      sanctioned: false,
    });
    expect(finding?.rule).toBe("radial-spotlight-glow");
    expect(finding?.severity).toBe("P3");
  },
);

auditRuleTest(
  [
    { rule: "radial-halo", kind: "silent", reason: "the neutral non-fading vignette is the nearest legitimate neighbour" },
    { rule: "radial-spotlight-glow", kind: "silent", reason: "the sanctioned small carrier stays clean" },
  ],
  "sanctioned carriers, small surfaces, neutral vignettes, and non-fading gradients all pass",
  () => {
    const spotlightValue = "radial-gradient(circle, rgba(80, 111, 255, 0.26), transparent 44%)";
    expect(checkRadialGlow({ selector: ".aura", value: spotlightValue, width: 600, height: 300, sanctioned: true })).toBeNull();
    expect(checkRadialGlow({ selector: ".badge", value: spotlightValue, width: 40, height: 40, sanctioned: false })).toBeNull();
    const neutralVignette = "radial-gradient(circle, rgba(0, 0, 0, 0.3), transparent)";
    expect(checkRadialGlow({ selector: ".vignette", value: neutralVignette, width: 600, height: 300, sanctioned: false })).toBeNull();
    const realBackground = "radial-gradient(circle, rgb(40, 40, 60), rgb(20, 20, 30))";
    expect(checkRadialGlow({ selector: ".bg", value: realBackground, width: 600, height: 300, sanctioned: false })).toBeNull();
  },
);

// ── decorative bg patterns (impeccable stripes / grid) ───────────────────────

auditRuleTest(
  [
    { rule: "stripe-background", kind: "fires", reason: "a repeating stripe sample emits" },
    { rule: "stripe-background", kind: "silent", reason: "the same decoration on a sliver-sized element stays clean" },
    { rule: "grid-line-background", kind: "fires", reason: "a two-axis grid sample emits" },
    { rule: "grid-line-background", kind: "silent", reason: "the same decoration on a sliver-sized element stays clean" },
  ],
  "stripe and grid pattern samples fire their P3 rules; a sliver-sized element passes",
  () => {
    const stripe = checkBgPattern({ selector: ".texture", kind: "stripe", backgroundSize: "auto", width: 400, height: 200 });
    expect(stripe?.rule).toBe("stripe-background");
    const grid = checkBgPattern({ selector: ".blueprint", kind: "grid", backgroundSize: "24px 24px", width: 800, height: 600 });
    expect(grid?.rule).toBe("grid-line-background");
    const sliver = checkBgPattern({ selector: ".divider", kind: "stripe", backgroundSize: "auto", width: 400, height: 2 });
    expect(sliver).toBeNull();
  },
);

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

auditRuleTest(
  [{ rule: "icon-tile-stack", kind: "fires", reason: "the rounded-square icon tile over a heading emits" }],
  "the canonical rounded-square icon tile above a heading fires icon-tile-stack at P3",
  () => {
    const finding = checkIconTile(ICON_TILE_BASE);
    expect(finding?.rule).toBe("icon-tile-stack");
    expect(finding?.severity).toBe("P3");
  },
);

auditRuleTest(
  [{ rule: "icon-tile-stack", kind: "silent", reason: "an avatar circle and oversized sibling stay clean" }],
  "circles (avatars), oversized siblings, and tiles without an icon child all pass",
  () => {
    expect(checkIconTile({ ...ICON_TILE_BASE, siblingRadiusPx: 24 })).toBeNull(); // radius ≥ w/2 = circle
    expect(checkIconTile({ ...ICON_TILE_BASE, siblingWidth: 300, siblingHeight: 300 })).toBeNull();
    expect(checkIconTile({ ...ICON_TILE_BASE, hasIconChild: false })).toBeNull();
  },
);

// ── static motion offenders (impeccable bounce/layout-transition) ────────────

auditRuleTest(
  [
    { rule: "bounce-easing", kind: "fires", reason: "bounce names and overshoot beziers emit" },
    { rule: "bounce-easing", kind: "silent", reason: "a non-overshooting easing in the same callback stays clean" },
  ],
  "bounce animation names and overshoot beziers fire bounce-easing at P2 (motion law §4.3)",
  () => {
    const named = checkMotionStatic({ selector: ".badge", kind: "bounce-name", value: "bounce-in", panelExempt: false });
    expect(named?.rule).toBe("bounce-easing");
    expect(named?.severity).toBe("P2");
    const bezier = checkMotionStatic({ selector: ".pop", kind: "overshoot-bezier", value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", panelExempt: false });
    expect(bezier?.rule).toBe("bounce-easing");
    expect(checkMotionStatic({ selector: ".fade", kind: "overshoot-bezier", value: "cubic-bezier(0.2, 0, 0, 1)", panelExempt: false })).toBeNull();
  },
);

auditRuleTest(
  [
    { rule: "layout-transition", kind: "fires", reason: "a layout-property transition emits" },
    { rule: "layout-transition", kind: "silent", reason: "accordion and collapsible panel slots are ratified neighbours" },
  ],
  "a layout-property transition fires at P3; the accordion/collapsible panel slots are exempt (motion law §3.7)",
  () => {
    const finding = checkMotionStatic({ selector: ".drawer", kind: "layout-transition", value: "width, padding", panelExempt: false });
    expect(finding?.rule).toBe("layout-transition");
    expect(finding?.severity).toBe("P3");
    expect(checkMotionStatic({ selector: ".panel", kind: "layout-transition", value: "height", panelExempt: true })).toBeNull();
  },
);

// ── page censuses (impeccable, ramp-bound) ───────────────────────────────────

auditRuleTest(
  [
    { rule: "off-theme-font", kind: "fires", reason: "a rendered face outside token stacks emits" },
    { rule: "off-theme-font", kind: "silent", reason: "every face from token stacks stays clean" },
  ],
  "a rendered face outside the token stacks fires off-theme-font; the token faces are clean",
  () => {
    const findings = checkFontCensus({
      faces: [
        { name: "geist", available: true },
        { name: "inter", available: true },
      ],
      probeUsable: true,
      sizes: [],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("off-theme-font");
    expect(findings[0]?.value).toBe("inter (paints)");
    expect(
      checkFontCensus({
        faces: [
          { name: "geist", available: true },
          { name: "geist mono", available: true },
        ],
        probeUsable: true,
        sizes: [],
      }),
    ).toEqual([]);
  },
);

// ── #23: the census reads the DECLARED cascade, so "on the token ramp" was never proof of what PAINTS ──
// Measured on this tree while writing these: the app declares `Geist, ui-sans-serif, system-ui,
// sans-serif`, the repo registers no @font-face, the host has no Geist installed, and `document.fonts`
// carries twenty KaTeX faces and no Geist — while every design-audit run reported the font census clean.
// The arm below is that false clean, closed. `document.fonts.check` cannot be the guard: for an
// unregistered family the spec makes it vacuously true (measured: check("16px ZzzNotAFont") === true).
auditRuleTest(
  [{ rule: "off-theme-font", kind: "fires", reason: "a token face the environment measurably cannot paint emits" }],
  "a declared token face that measurably does not paint fires off-theme-font — the surface renders a fallback nobody chose",
  () => {
    const findings = checkFontCensus({ faces: [{ name: "geist", available: false }], probeUsable: true, sizes: [] });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("off-theme-font");
    expect(findings[0]?.value).toBe("geist (token face, not paintable)");
    expect(findings[0]?.message).toContain("MEASURABLY does not paint");
    expect(fontCensusPopulations({ faces: [{ name: "geist", available: false }], probeUsable: true, sizes: [] })).toEqual({
      candidates: 1,
      judged: 1,
      affected: 1,
      populations: 1,
      emitted: 1,
      withheld: {},
      excluded: {},
      collapsed: {},
    });
  },
);

test("a probe that failed its own control WITHHOLDS the token-face verdict — it never publishes a pass it did not measure", () => {
  const census = { faces: [{ name: "geist", available: false }], probeUsable: false, sizes: [] } as const;
  expect(checkFontCensus(census)).toEqual([]);
  expect(fontCensusPopulations(census)).toEqual({
    candidates: 1,
    judged: 0,
    affected: 0,
    populations: 0,
    emitted: 0,
    withheld: { faceProbeUnusable: 1 },
    excluded: {},
    collapsed: {},
  });
});

test("an unmeasurable probe still fires on a STRAY face — that arm is a cascade fact and needs no environment evidence", () => {
  const findings = checkFontCensus({ faces: [{ name: "comic sans ms", available: false }], probeUsable: false, sizes: [] });
  expect(findings).toHaveLength(1);
  expect(findings[0]?.value).toBe("comic sans ms (paint unmeasured)");
  expect(fontCensusPopulations({ faces: [{ name: "comic sans ms", available: false }], probeUsable: false, sizes: [] }).judged).toBe(1);
});

test("a stray face the environment cannot paint says so — the reader is told a fallback rendered, not that Comic Sans did", () => {
  const findings = checkFontCensus({ faces: [{ name: "comic sans ms", available: false }], probeUsable: true, sizes: [] });
  expect(findings[0]?.value).toBe("comic sans ms (declared, not paintable)");
  expect(findings[0]?.message).toContain("unnamed fallback");
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

auditRuleTest(
  [{ rule: "caveat-outweighed", kind: "fires", reason: "an alert sentence outweighed in its block emits" }],
  "an alert sentence outweighed by a same-block sibling fires caveat-outweighed at P2",
  () => {
    const findings = checkCaveatHierarchy([ALERT_CAVEAT, LOUD_HOSTNAME]);
    expect(findings.map((f) => f.rule)).toEqual(["caveat-outweighed"]);
    expect(findings[0]?.severity).toBe("P2");
    expect(findings[0]?.selector, "the finding is filed against the whispering alert, not its partner").toBe("p[role=alert]:nth-of-type(1)");
    expect(findings[0]?.message, "and it must NAME the partner, or nobody can decide which side to change").toContain(
      "span[data-voice=datumMono]:nth-of-type(1)",
    );
  },
);

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

auditRuleTest(
  [{ rule: "caveat-outweighed", kind: "silent", reason: "a partner within one ramp step stays clean" }],
  "a partner inside one ramp step is not an inversion — the floor is a real step, not a rounding difference",
  () => {
    expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, fontSizePx: 11.5 }])).toEqual([]);
    expect(checkCaveatHierarchy([ALERT_CAVEAT, { ...LOUD_HOSTNAME, fontSizePx: 13 }]).map((f) => f.rule)).toEqual(["caveat-outweighed"]);
  },
);

auditRuleTest(
  [
    { rule: "flat-type-hierarchy", kind: "fires", reason: "a compressed heading-size spread emits" },
    { rule: "flat-type-hierarchy", kind: "silent", reason: "the real ramp spread stays clean" },
  ],
  "a compressed size spread fires flat-type-hierarchy; the real ramp spread passes",
  () => {
    const flat = checkFontCensus({ faces: [], probeUsable: true, sizes: [12, 13, 14] });
    expect(flat.map((f) => f.rule)).toContain("flat-type-hierarchy");
    const ramp = checkFontCensus({ faces: [], probeUsable: true, sizes: [10.5, 13, 15, 24] });
    expect(ramp).toEqual([]);
  },
);

// ── duplicate-action-door: which repetitions are HOMES (#252 · #851) ─────────
// The walker hands over one row per offered named control; this function decides how many HOMES they
// amount to. Outside a list a home is a distinct structural path. Inside a list the ROWS answer instead
// (#851): a transcript row that wraps its subtree conditionally (`theme-scope` on a themed speaker,
// `message-content-column` otherwise) produced two paths for one per-row action, and the rule fired on
// every virtualized list at coarse pointer — where every row's action cluster is permanent rather than
// hover-revealed, so two rows' doors are on one plane at once.

/** A door as the walker emits it; `list`/`item` default to the not-in-a-list case. `toolbarKey` is null
 *  throughout: the view-switch-cell exclusion (#1705) is a DOM fact, so its proof is the rendered fixture in
 *  `ops/walker/census-interactive.int.test.ts`, not a hand-built sample. */
function door(selector: string, path: string, list: string | null = null, item: string | null = null): ActionDoorInput {
  return { selector, role: "button", name: "more message actions", path, listKey: list, itemKey: item, toolbarKey: null };
}

auditRuleTest(
  [{ rule: "duplicate-action-door", kind: "silent", reason: "sibling rows in one list remain one legitimate home" }],
  "#851: sibling rows of one list are ONE home even when their subtrees diverge",
  () => {
    // The live shape: three message rows of one <ol>, two reaching the button through `theme-scope` and one
    // through `message-content-column`.
    const findings = checkDuplicateDoors([
      door("#a", "button<row<theme-scope<li", "list-1", "row-1"),
      door("#b", "button<row<content-column<li", "list-1", "row-2"),
      door("#c", "button<row<theme-scope<li", "list-1", "row-3"),
    ]);

    expect(findings, `one action cluster per row is per-datum repetition — got ${JSON.stringify(findings.map((f) => f.value))}`).toEqual([]);
  },
);

auditRuleTest(
  [{ rule: "duplicate-action-door", kind: "fires", reason: "duplicate actions in distinct homes emit" }],
  "#851: the fold is per LIST, not global — two homes in ONE row, and two doors outside any list, still fire",
  () => {
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
  },
);

test("duplicate-action-door stays observable and bounded above six distinct authored homes", () => {
  const findings = checkDuplicateDoors(Array.from({ length: 7 }, (_unused, index) => door(`#door-${String(index)}`, `button<home-${String(index)}`)));
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({
    rule: "duplicate-action-door",
    population: { affected: 7, judged: 7, capped: 1 },
  });
  expect(findings[0]?.representatives).toHaveLength(6);
});

// ── #1720: DUPLICATE_DOOR_ALLOWANCES — the runtime rule's own ruled-pairing home ──────────────────────
// Every test below passes a FABRICATED allowance table (never the module's empty production
// `DUPLICATE_DOOR_ALLOWANCES`, which stays empty per the header receipt in
// tooling/src/ui-audit/lib/checks-duplicate-door.ts) so the mechanism is pinned without minting a
// production ruling that would immediately read as stale.

test("#1720: an allowed pairing does not fire, and is excluded (not silently dropped) from the population", () => {
  const doors = [door("#a", "button<home-a"), door("#b", "button<home-b")];
  const allowances = { "button|more message actions": { why: "test-only ruling" } };

  const { findings, accounting } = checkDuplicateDoorPopulations(doors, allowances);

  expect(findings).toEqual([]);
  expect(accounting).toMatchObject({ candidates: 2, judged: 0, excluded: { ruledDual: 2 } });
});

test("#1720: a THIRD door on an already-ruled pair still shows up in the denominator", () => {
  const doors = [door("#a", "button<home-a"), door("#b", "button<home-b"), door("#c", "button<home-c")];
  const allowances = { "button|more message actions": { why: "test-only ruling" } };

  const { findings, accounting } = checkDuplicateDoorPopulations(doors, allowances);

  expect(findings, "the allowance covers the RULED pairing, not an unbounded population").toEqual([]);
  expect(accounting.excluded).toEqual({ ruledDual: 3 });
});

test("#1720: checkStaleDuplicateDoorAllowances is silent when the ruled pairing still offers two homes", () => {
  const doors = [door("#a", "button<home-a"), door("#b", "button<home-b")];
  const allowances = { "button|more message actions": { why: "test-only ruling" } };

  expect(checkStaleDuplicateDoorAllowances(doors, allowances)).toEqual([]);
});

test("#1720: checkStaleDuplicateDoorAllowances FIRES when a ruled pairing no longer offers two homes (the pair was fixed, or renamed)", () => {
  const oneHomeLeft = [door("#a", "button<home-a")];
  const allowances = { "button|more message actions": { why: "test-only ruling" } };

  const stale = checkStaleDuplicateDoorAllowances(oneHomeLeft, allowances);

  expect(stale).toHaveLength(1);
  expect(stale[0]).toContain("button|more message actions");
  expect(stale[0]).toContain("test-only ruling");

  const renamedAway: readonly ActionDoorInput[] = [];
  expect(checkStaleDuplicateDoorAllowances(renamedAway, allowances)).toHaveLength(1);
});

// ── measured-spill pass-throughs (impeccable) ────────────────────────────────

auditRuleTest(
  [
    { rule: "text-overflow", kind: "fires", reason: "the visible spill fixture emits" },
    { rule: "truncated-to-nothing", kind: "fires", reason: "the zero-visible-text fixture emits" },
    { rule: "repeated-container-text", kind: "fires", reason: "repeated copy in distinct spots emits" },
    { rule: "clipped-overflow", kind: "fires", reason: "in-flow and positioned spill fixtures emit" },
    { rule: "edge-flush-cards", kind: "fires", reason: "cards flush against the scroller edge emit" },
  ],
  "text-overflow, repeated-container-text, clipped-overflow, and edge-flush-cards carry their fixed severities",
  () => {
    expect(checkTextOverflow({ selector: ".cell", spillPx: 45, mode: "inline" }).severity).toBe("P1");
    expect(checkTruncatedText({ selector: ".label", naturalPx: 57, visiblePx: 0, clipSelector: ".row", text: "Saved cast" }).severity).toBe("P1");
    expect(checkRepeatedText({ containerSelector: ".card", text: "Active", count: 3, distinctSigs: 3 }).severity).toBe("P3");
    expect(checkClippedOverflow({ selector: ".row", childSelector: ".menu", flow: "positioned", side: null, spillPx: 0 }).severity).toBe("P2");
    expect(checkEdgeFlush({ scrollerSelector: ".strip", cardSelector: ".chip", edge: "right", gapPx: 2, count: 3 }).severity).toBe("P3");
  },
);

auditRuleTest(
  [{ rule: "obscured-target", kind: "fires", reason: "a covered informative target emits the compositor disagreement" }],
  "an obscured target names the neighbour that owns its centre",
  () => {
    const finding = checkObscuredTarget({
      selector: ".badge",
      hitSelector: "button.start",
      overlapPx: 48,
      coveredRatio: 0.75,
      interactive: false,
      text: "2 rules",
    });
    expect(finding.rule).toBe("obscured-target");
    expect(finding.severity).toBe("P1");
  },
);

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

auditRuleTest(
  [{ rule: "script-error", kind: "fires", reason: "page errors dedupe and emit" }],
  "script errors dedupe by first line, cap at 3, and fire at P0",
  () => {
    const findings = checkScriptErrors([
      "TypeError: x is undefined\n  at boot.js:1",
      "TypeError: x is undefined\n  at boot.js:9", // duplicate first line
      "ReferenceError: y\n  at a.js:2",
      "SyntaxError: z\n  at b.js:3",
      "RangeError: w\n  at c.js:4", // over the cap
    ]);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "P0" && f.rule === "script-error")).toBe(true);
  },
);

auditRuleTest(
  [{ rule: "script-error", kind: "silent", reason: "an empty page-error list stays clean" }],
  "no page errors means no script-error findings",
  () => {
    expect(checkScriptErrors([])).toEqual([]);
  },
);

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

test.each([
  ["under-settled", { candidates: 1, judged: 0, withheld: {}, excluded: {} }],
  ["negative", { candidates: -1, judged: 0, withheld: { invalid: -1 }, excluded: {} }],
  ["fractional", { candidates: 0.5, judged: 0, withheld: { invalid: 0.5 }, excluded: {} }],
  ["cap-inconsistent", { candidates: 0, judged: 0, withheld: { cap: 1 }, excluded: {} }],
] as const)("relational population accounting fails loud when %s counters cannot settle", (_label, malformed) => {
  expect(() =>
    collectAudit({
      ...EMPTY_SAMPLES,
      relationalAccounting: {
        "cohort-anatomy": malformed,
        "pane-ink": { candidates: 0, judged: 0, withheld: {}, excluded: {} },
        "row-void": { candidates: 0, judged: 0, withheld: {}, excluded: {} },
      },
    }),
  ).toThrow("INSTRUMENT ERROR");
});

test.each([
  [
    "affected without a candidate or judgment",
    { candidates: 0, judged: 0, affected: 1, populations: 1, emitted: 1, withheld: {}, excluded: {}, collapsed: {} },
  ],
  ["affected above candidates and judgments", { candidates: 1, judged: 1, affected: 2, populations: 1, emitted: 2, withheld: {}, excluded: {}, collapsed: {} }],
  [
    "affected above judgments inside a larger candidate census",
    { candidates: 2, judged: 1, affected: 2, populations: 1, emitted: 2, withheld: { unresolved: 1 }, excluded: {}, collapsed: {} },
  ],
] as const)("settled population accounting fails loud when %s", (_label, malformed) => {
  expect(() => settledPopulationAccounting("cohort-anatomy", malformed)).toThrow("INSTRUMENT ERROR");
});

test("settled population accounting closes explicit semantic exclusions without weakening evidence gaps", () => {
  const excluded = {
    candidates: 1,
    judged: 0,
    affected: 0,
    populations: 0,
    emitted: 0,
    withheld: {},
    excluded: { notApplicable: 1 },
    collapsed: {},
  };
  const withheld = {
    candidates: 1,
    judged: 0,
    affected: 0,
    populations: 0,
    emitted: 0,
    withheld: { unaskable: 1 },
    excluded: {},
    collapsed: {},
  };

  expect(settledPopulationAccounting("row-void", excluded)).toEqual(excluded);
  expect(populationEvidenceGap({ "row-void": excluded })).toBeNull();
  expect(populationEvidenceGap({ "obscured-target": withheld })?.detail).toContain("unaskable=1");
});

// #1385 item 2: a NO-VERDICT that names a reason and no way out costs its reader a trip through the walker
// source to learn whether the run was recoverable at all. The selection-idiom withhold on a rest-arm audit
// is the recurring instance (#1114 makes it STRUCTURAL there), so it names the driven arm that closes it.
test("a withheld reason with a known remedy prints it; one without keeps the bare NO-VERDICT text", () => {
  const withheldAs = (reason: string): RulePopulationAccounting => ({
    candidates: 1,
    judged: 0,
    affected: 0,
    populations: 0,
    emitted: 0,
    withheld: { [reason]: 1 },
    excluded: {},
    collapsed: {},
  });

  const remedied = populationEvidenceGap({ "selection-idiom": withheldAs("unmatchedUnselected") })?.detail;
  expect(remedied).toContain("unmatchedUnselected=1");
  expect(remedied).toContain("Remedy —");
  expect(remedied).toContain("--open-chat");
  // THE CONTROL. The remedy map is deliberately sparse — a reason with no verified operator action must
  // print exactly as before rather than carry invented advice.
  expect(populationEvidenceGap({ "obscured-target": withheldAs("unaskable") })?.detail).not.toContain("Remedy —");
});

test("collision populations group repeated instances without erasing a later authored decision", () => {
  const repeatedTruncation = Array.from({ length: 9 }, (_unused, index) => ({
    selector: `.repeated-${String(index)}`,
    naturalPx: 60,
    visiblePx: 0,
    clipSelector: ".repeated-row",
    text: `Repeated ${String(index)}`,
    authoredTarget: "span|slot=cast-name|role=|type=",
    authoredHome: "div@cast-row",
  }));
  const distinctTruncation = {
    selector: ".later-distinct",
    naturalPx: 80,
    visiblePx: 0,
    clipSelector: ".theme-row",
    text: "Later distinct",
    authoredTarget: "span|slot=theme-name|role=|type=",
    authoredHome: "div@theme-row",
  };
  const repeatedObscuration = Array.from({ length: 23 }, (_unused, index) => ({
    selector: `.badge-${String(index)}`,
    hitSelector: `.start-${String(index)}`,
    overlapPx: 24,
    coveredRatio: 0.75,
    interactive: false,
    text: "2 rules",
    authoredTarget: "span|slot=rule-count|role=|type=",
    authoredHome: "div@cast-row",
    hitAuthoredTarget: "button|slot=start|role=|type=",
    hitAuthoredHome: "div@cast-row",
  }));
  const distinctObscuration = {
    selector: ".later-label",
    hitSelector: ".delete",
    overlapPx: 20,
    coveredRatio: 0.5,
    interactive: false,
    text: "Archive",
    authoredTarget: "span|slot=archive-label|role=|type=",
    authoredHome: "div@archive-row",
    hitAuthoredTarget: "button|slot=delete|role=|type=",
    hitAuthoredHome: "div@archive-row",
  };
  const audit = collectAudit({
    ...EMPTY_SAMPLES,
    truncatedTexts: [...repeatedTruncation, distinctTruncation],
    obscuredTargets: [...repeatedObscuration, distinctObscuration],
    obscuredScan: { candidates: 24, unaskable: 0 },
  });
  expect(audit.findings.filter(({ rule }) => rule === "truncated-to-nothing")).toHaveLength(2);
  expect(audit.populationAccounting["truncated-to-nothing"]).toMatchObject({
    candidates: 10,
    judged: 10,
    affected: 10,
    populations: 2,
    emitted: 6,
    withheld: { cap: 4 },
  });
  expect(audit.findings.filter(({ rule }) => rule === "obscured-target")).toHaveLength(2);
  expect(audit.populationAccounting["obscured-target"]).toMatchObject({
    candidates: 24,
    judged: 24,
    affected: 24,
    populations: 2,
    emitted: 6,
    withheld: { cap: 18 },
  });
});

test("type-floor populations collapse repeated authored instances without merging a different home", () => {
  const repeated = Array.from({ length: 8 }, (_unused, index) => ({
    ...TEXT_STYLE_BASE,
    selector: `.style-option-${String(index)}`,
    authoredTarget: "span|slot=text|role=|type=",
    authoredHome: "button@style-option::span<button@style-option",
    fontSizePx: TEXT_MICRO_PX,
    interactive: true,
  }));
  const distinct = {
    ...TEXT_STYLE_BASE,
    selector: ".collapsible-label",
    authoredTarget: "span|slot=text|role=|type=",
    authoredHome: "button@collapsible-trigger::span<button@collapsible-trigger",
    fontSizePx: TEXT_MICRO_PX,
    interactive: true,
  };
  const audit = collectAudit({ ...EMPTY_SAMPLES, textStyles: [...repeated, distinct] });
  const findings = audit.findings.filter(({ rule }) => rule === "undersized-ui-text");

  expect(findings).toHaveLength(2);
  expect(findings.map(({ population }) => population).sort((left, right) => (right?.affected ?? 0) - (left?.affected ?? 0))).toEqual([
    { affected: 8, judged: 8, capped: 3 },
    { affected: 1, judged: 1, capped: 0 },
  ]);
  expect(audit.populationAccounting["undersized-ui-text"]).toMatchObject({
    candidates: 9,
    judged: 9,
    affected: 9,
    populations: 2,
    emitted: 6,
    withheld: { cap: 3 },
  });
  expect(audit.populationAccounting["text-below-ramp"]).toMatchObject({ candidates: 9, judged: 9, affected: 0, populations: 0, emitted: 0 });

  const belowRamp = collectAudit({
    ...EMPTY_SAMPLES,
    textStyles: [...repeated, distinct].map((input) => ({ ...input, fontSizePx: TEXT_MICRO_PX - 1, interactive: false })),
  });
  expect(belowRamp.findings.filter(({ rule }) => rule === "text-below-ramp")).toHaveLength(2);
  expect(belowRamp.populationAccounting["text-below-ramp"]).toMatchObject({
    candidates: 9,
    judged: 9,
    affected: 9,
    populations: 2,
    emitted: 6,
    withheld: { cap: 3 },
  });
});

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
        nativeLabelText: null,
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
    fontCensus: { faces: [{ name: "comic sans ms", available: true }], probeUsable: true, sizes: [] },
  });
  const rules = findings.map((f) => f.rule).sort((a, b) => a.localeCompare(b));
  expect(rules).toEqual(["broken-image", "off-theme-font", "text-below-ramp", "text-overflow"]);
  expect(findings.every((f) => f.origin === "impeccable")).toBe(true);
});

test("collectFindings on an all-clean bundle (incl. a present main landmark) returns nothing", () => {
  expect(collectFindings(EMPTY_SAMPLES)).toEqual([]);
});

test("family populations are the exact detector dispatches, including both decor detectors", () => {
  expect(collectAudit(EMPTY_SAMPLES).familyScans).toEqual({
    // 9 since border-contrast joined the a11y family with #1315's --contrast-edge carry-over (its
    // per-side border ink vs the composited surround is a WCAG 1.4.11 non-text-contrast judgement),
    // and reveal-coverage (#1077) is an accounting-only ninth dispatch beside it.
    a11y: 9,
    // 4 since the forced-state family joined colour: contrast · gray-on-color · quiet-state · hover-contrast.
    color: 4,
    // 3 since #1027 split the accent-border detector into its two RULE dispatches (side-tab ·
    // border-accent-on-rounded), each publishing its own rung-2 population over the shared census.
    decor: 3,
    // 4 since buried-raster joined media (distorted-image · broken-image · buried-raster), and
    // canvas-ink (#1079) is an accounting-only fourth dispatch beside it.
    media: 4,
    // 7 for the same #1027 reason: radial-halo · radial-spotlight-glow · stripe-background ·
    // grid-line-background · icon-tile-stack · layout-transition · bounce-easing are seven RULES
    // sharing three walker censuses, and a scan is a rule dispatch, not a detector call.
    ornament: 7,
    // 12 since the two text-occlusion arms (headline-overhang · inline-padding-leak), tier-drift, and the
    // two device-pixel-grid CAUSE arms (promoted-layer-offset · off-grid-transform — crispness Laws 3 and
    // 2's resolved half) joined.
    quality: 12,
    structure: 8,
    // 10 since #1027: the two rung-4 type floors ride one dispatch, then the six per-element rules
    // (line-length · tight-leading · justified-text · all-caps-body · wide-tracking · crushed-tracking)
    // each own a rung-2 partition over the shared text census, plus caveat-outweighed, the page font
    // census, and the Law-4 runtime backstop (off-grid-text).
    typography: 10,
  });
});

// ── THE CLI CONTRACT MOVED (#1315) ──────────────────────────────────────────────────────────────
// This dir has no argv door any more: the scan is `pnpm snap <route> --design-audit`, so the grammar
// pins that lived here (the argv-ordered nav/click queue, the unknown-flag refusal, `--mobile`'s
// device-not-viewport rule, the shared environment/artifact families) are snap's parser's — they are
// in tests/tooling/snap/ops/parse.test.ts, where the arm's own two flags now sit beside them. Nothing
// was dropped: every one of those behaviours was ALREADY pinned there for snap's identical spelling.

// ── hover-contrast (the FORCED-STATE family) ──────────────────────────────────
// The rule impeccable emits under its EXISTING `low-contrast` id, which is why our 59-rule adoption
// triage never saw it. Samples come from ops/hover.ts's CDP pass; everything below is the pure half.

function hoverSample(over: Partial<HoverContrastInput> = {}): HoverContrastInput {
  return {
    selector: "nav[data-slot=nav-links] > a.cta",
    subjectSelector: "nav[data-slot=nav-links] > a.cta",
    // Rest: white on near-black — comfortably legible, so `contrast` files nothing.
    restColor: WHITE,
    restBackdrop: NEAR_BLACK,
    // Hover: the classic override — a broader `.nav-links a:hover` wins and swaps in a pale plate.
    hoverColor: LIGHT_GRAY,
    hoverBackdrop: FLAT_WHITE,
    fontSizePx: 14,
    fontWeight: 400,
    foregroundOpacity: 1,
    inactive: "none",
    transitionCoversPaint: false,
    transitionDurationMs: 0,
    ...over,
  };
}

function hoverScan(over: Partial<HoverScanInput["census"]> = {}, rest: Partial<Omit<HoverScanInput, "census">> = {}): HoverScanInput {
  return {
    census: { candidates: 1, judged: 1, withheld: {}, excluded: {}, ...over },
    sheetsRead: 4,
    sheetsUnreadable: 0,
    hoverRules: 17,
    unparseableSelectors: 0,
    subjectsForced: 1,
    notRestored: 0,
    ...rest,
  };
}

auditRuleTest(
  [{ rule: "hover-contrast", kind: "fires", reason: "a CTA legible at rest drops to a pale plate under a broader :hover selector" }],
  "hover-contrast fires when the hover pair fails WCAG on a control that passes at rest",
  () => {
    const finding = checkHoverContrast(hoverSample());

    expect(finding?.rule).toBe("hover-contrast");
    expect(finding?.severity).toBe("P1");
    expect(finding?.origin).toBe("impeccable");
    // The value states BOTH states: a hover ratio alone reads as an ordinary contrast row.
    expect(finding?.value).toContain("hovered");
    expect(finding?.value).toContain("rest");
  },
);

auditRuleTest(
  [{ rule: "hover-contrast", kind: "silent", reason: "the nearest legitimate neighbour — a control that changes colour on hover and stays above the floor" }],
  "hover-contrast is silent when the hover pair clears the floor",
  () => {
    // Same shape, same mechanism, legible outcome: dark ink on the pale hover plate.
    expect(checkHoverContrast(hoverSample({ hoverColor: BLACK }))).toBeNull();
  },
);

test("hover-contrast never double-reports an element that already fails at REST — that row is contrast's", () => {
  // Rest is 1.5:1 already; `contrast` owns it. The hover pair here fails TOO (and differs from rest, so
  // the no-change arm cannot be what silences it) — filing it would hand a reviewer the same defect under
  // two ids and two denominators.
  const alreadyBad = hoverSample({ restColor: LIGHT_GRAY, restBackdrop: FLAT_WHITE, hoverColor: { r: 200, g: 200, b: 200 } });

  expect(checkHoverContrast(alreadyBad)).toBeNull();
  expect(hoverContrastPopulations([alreadyBad], hoverScan()).excluded["restAlreadyFails"]).toBe(1);
});

// #1320, with its premise CORRECTED by the red-first probe. The row expected `assertCensusAccounting` on
// the INCOMING census to catch over-counts the old hand-rolled guard could not see. It does not: both
// over-count arms below ALREADY threw against the unmodified source, because the pass is count-preserving
// (each input leaves `judged` for exactly one `withheld`/`excluded` bucket), so
// `candidates = judged + withheld + excluded` on the OUTGOING row is the same equation as on the incoming
// one — they differ only by `representativeCap`, which is separately refused on one side and forced to
// zero by `affected = emitted + cap` on the other. What the shared assertion buys is therefore ATTRIBUTION
// and EARLINESS, not reach: the throw now names the WALKER's census with the walker's own numbers, before
// the loop, instead of surfacing as a Node-side settle error that reads like a bug in this file. These
// arms are FENCES over that wording and over the preserved seam check; the last line is the negative
// control that keeps them from passing vacuously.
test("hover-contrast refuses an incoming census that does not settle, in the WALKER's own words", () => {
  const sample = hoverSample();

  expect(() => hoverContrastPopulations([sample], hoverScan({ candidates: 4 }))).toThrow(
    "INSTRUMENT ERROR: hover-contrast candidates 4 do not settle as judged 1 + withheld 0 + excluded 0",
  );
  expect(() => hoverContrastPopulations([sample], hoverScan({ candidates: 9, withheld: { noHoverPaint: 3 } }))).toThrow(
    "INSTRUMENT ERROR: hover-contrast candidates 9 do not settle as judged 1 + withheld 3 + excluded 0",
  );
  // A walker may not supply the Node-owned representative cap — the reach the outgoing settle only ever
  // reported as a mismatched `affected`.
  expect(() => hoverContrastPopulations([sample], hoverScan({ candidates: 2, withheld: { cap: 1 } }))).toThrow(
    "INSTRUMENT ERROR: hover-contrast walker supplied Node-owned cap accounting",
  );
  // The seam half of the OLD guard is preserved by the same call (assertRelationalCensus spells both).
  expect(() => hoverContrastPopulations([sample], hoverScan({ candidates: 2, judged: 2, withheld: {} }))).toThrow(
    "INSTRUMENT ERROR: hover-contrast walker judged 2 but returned 1 sample(s)",
  );
  // A settled census — the same shapes, accounted — is accepted, so the arms above fail on the ARITHMETIC
  // and not on the fixture being unbuildable.
  expect(hoverContrastPopulations([sample], hoverScan({ candidates: 4, withheld: { noHoverPaint: 3 } })).candidates).toBe(4);
});

test("a control with NO hover paint is EXCLUDED from the hover denominator, never judged", () => {
  // The walker prefilter resolved 10 visible texts and found hover paint on 1 of them. The other 9 are a
  // measured fact about this surface, not nine silent passes.
  const row = hoverContrastPopulations([hoverSample({ hoverColor: BLACK })], hoverScan({ candidates: 10, excluded: { noHoverPaint: 9 } }));

  expect(row.candidates).toBe(10);
  expect(row.excluded["noHoverPaint"]).toBe(9);
  expect(row.judged).toBe(1);
  expect(row.affected).toBe(0);
  // Exclusions are denominator evidence and never make the run partial.
  expect(populationEvidenceGap({ "hover-contrast": row })).toBeNull();
});

test("a subject whose :hover could NOT be forced is WITHHELD, and the run says so out loud", () => {
  // ops/hover.ts buckets a group whose force or read threw as `forceFailed`. A withheld candidate is the
  // instrument admitting it could not judge, which is a NO VERDICT — never a quieter clean number.
  const row = hoverContrastPopulations(
    [hoverSample({ hoverColor: BLACK })],
    hoverScan({ candidates: 10, judged: 1, withheld: { forceFailed: 2 }, excluded: { noHoverPaint: 7 } }),
  );

  expect(row.withheld["forceFailed"]).toBe(2);
  expect(populationEvidenceGap({ "hover-contrast": row })?.detail).toContain("hover-contrast: forceFailed=2");
});

test("a hover pair identical to the rest pair is excluded — there is no second state to judge", () => {
  const unchanged = hoverSample({ hoverColor: WHITE, hoverBackdrop: NEAR_BLACK });

  expect(checkHoverContrast(unchanged)).toBeNull();
  expect(hoverContrastPopulations([unchanged], hoverScan()).excluded["noHoverChange"]).toBe(1);
});

test("an identical pair whose OWN transition covers the paint is a DIFFERENT exclusion — the forced read may just be too fast", () => {
  // Same identical-pair shape as above, but the painted element declares a live color transition. This
  // is the #detector-adapt blind spot: the forced read happens at t≈0, before the transition advances, so
  // it cannot tell "no hover paint" from "hover paint arrives after the instant we looked". Splitting the
  // reason keeps that ambiguity out of the plain `noHoverChange` bucket instead of silently merging it in.
  const transitioning = hoverSample({ hoverColor: WHITE, hoverBackdrop: NEAR_BLACK, transitionCoversPaint: true, transitionDurationMs: 300 });

  expect(checkHoverContrast(transitioning)).toBeNull();
  const row = hoverContrastPopulations([transitioning], hoverScan());
  expect(row.excluded["noHoverChangeButTransitioned"]).toBe(1);
  expect(row.excluded["noHoverChange"]).toBeUndefined();
});

test("a transition declared but at ZERO duration is the plain noHoverChange bucket — no race to be blind to", () => {
  const zeroDuration = hoverSample({ hoverColor: WHITE, hoverBackdrop: NEAR_BLACK, transitionCoversPaint: true, transitionDurationMs: 0 });

  const row = hoverContrastPopulations([zeroDuration], hoverScan());
  expect(row.excluded["noHoverChange"]).toBe(1);
  expect(row.excluded["noHoverChangeButTransitioned"]).toBeUndefined();
});

test("the hover pass losing a sample between its phases is an INSTRUMENT ERROR, not a smaller denominator", () => {
  expect(() => hoverContrastPopulations([], hoverScan({ candidates: 1, judged: 1 }))).toThrow("INSTRUMENT ERROR");
});

test("no forced-state pass means NO hover-contrast row at all — absent is not a clean-looking zero", () => {
  const withoutPass = collectAudit(EMPTY_SAMPLES);
  const withPass = collectAudit({ ...EMPTY_SAMPLES, hoverStates: [hoverSample()], hoverScan: hoverScan() });

  expect(withoutPass.populationAccounting["hover-contrast"]).toBeUndefined();
  expect(withPass.populationAccounting["hover-contrast"]?.candidates).toBe(1);
  expect(withPass.findings.filter(({ rule }) => rule === "hover-contrast")).toHaveLength(1);
  // The forced-state family rides the SAME closed dispatcher as the rest of colour, so its scan counts.
  expect(withPass.familyScans.color).toBeGreaterThan(withoutPass.familyScans.color - 1);
});
