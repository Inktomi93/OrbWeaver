// Pure, DOM-free classification logic for design-audit.ts — every function here takes a plain data
// shape mirroring what getComputedStyle/getBoundingClientRect would yield (colors as {r,g,b}, sizes as
// numbers, booleans for DOM facts already resolved) and returns a Finding or null. NO subjective
// judgment: every threshold below is a fixed, cited number, not a vibe. This split exists so the
// decision logic is unit-testable WITHOUT a browser (the vitest node lanes have no DOM — Spine-Testing.md
// §7) — design-audit.ts's in-page walker (a raw-string page.evaluate, per _kit/browser.ts's docblock)
// gathers the raw facts; ALL severity/threshold decisions live here, in one tested place.
//
// WCAG contrast formula + large-text thresholds ported from the reference "impeccable" antipattern
// detector (relativeLuminance/contrastRatio, WCAG_LARGE_TEXT_PX = 18pt, WCAG_LARGE_BOLD_TEXT_PX = 14pt) —
// standard WCAG 2.x math, not reinvented. Everything else (image distortion, tap targets, ARIA name
// precedence, z-index/nested-card/gradient-text/animated-img-hover) has no upstream analog and is
// designed fresh against the thresholds specified for this probe.

export type Severity = "P0" | "P1" | "P2" | "P3";

export type Finding = {
  readonly rule: string;
  readonly severity: Severity;
  readonly selector: string;
  readonly value: string;
  readonly message: string;
};

const SEVERITIES: readonly Severity[] = ["P0", "P1", "P2", "P3"];

export function isValidSeverity(s: string): s is Severity {
  return (SEVERITIES as readonly string[]).includes(s);
}

/** True when `sev` is at least as severe as `floor` (P0 is the worst, P3 the mildest). */
export function isAtOrAboveSeverity(sev: Severity, floor: Severity): boolean {
  return SEVERITIES.indexOf(sev) <= SEVERITIES.indexOf(floor);
}

// ── Contrast (WCAG) ──────────────────────────────────────────────────────────

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

// sRGB→linear gamma correction (WCAG 2.x relative-luminance formula, ported from the reference detector).
const RGB_MAX_CHANNEL = 255;
const SRGB_GAMMA_THRESHOLD = 0.039_28;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;

function linearizeChannel(channel: number): number {
  const c = channel / RGB_MAX_CHANNEL;
  return c <= SRGB_GAMMA_THRESHOLD
    ? c / SRGB_LINEAR_DIVISOR
    : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA_EXPONENT;
}

const LUMINANCE_R_WEIGHT = 0.2126;
const LUMINANCE_G_WEIGHT = 0.7152;
const LUMINANCE_B_WEIGHT = 0.0722;

export function relativeLuminance(c: Rgb): number {
  return (
    LUMINANCE_R_WEIGHT * linearizeChannel(c.r) +
    LUMINANCE_G_WEIGHT * linearizeChannel(c.g) +
    LUMINANCE_B_WEIGHT * linearizeChannel(c.b)
  );
}

const CONTRAST_OFFSET = 0.05;

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + CONTRAST_OFFSET) / (Math.min(la, lb) + CONTRAST_OFFSET);
}

// CSS px per pt (96dpi/72pt) — WCAG's "18pt"/"14pt bold" large-text carve-out, expressed in the unit
// getComputedStyle actually reports.
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
const PT_TO_PX = CSS_PIXELS_PER_INCH / POINTS_PER_INCH;
const WCAG_LARGE_TEXT_PT = 18;
const WCAG_LARGE_BOLD_TEXT_PT = 14;
const LARGE_TEXT_PX = WCAG_LARGE_TEXT_PT * PT_TO_PX; // 24px
const LARGE_BOLD_TEXT_PX = WCAG_LARGE_BOLD_TEXT_PT * PT_TO_PX; // ~18.67px
const BOLD_WEIGHT = 700;

export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return (
    fontSizePx >= LARGE_TEXT_PX || (fontSizePx >= LARGE_BOLD_TEXT_PX && fontWeight >= BOLD_WEIGHT)
  );
}

// Exported: snap.ts's --contrast reuses these floors directly rather than re-hardcoding them.
export const NORMAL_MIN_RATIO = 4.5;
export const LARGE_MIN_RATIO = 3;

/** The resolved backdrop behind a text node — `flat` (a solid ancestor bg), `gradient` (color stops
 *  parsed straight out of the CSS gradient string — worst-stop ratio is used, an approximation, not
 *  pixel sampling), or `image-indeterminate` (a real `url(...)` background-image; no cheap DOM-only way
 *  to know its pixel color under the text, so it's flagged rather than silently passed). */
export type Backdrop =
  | { readonly kind: "flat"; readonly color: Rgb }
  | { readonly kind: "gradient"; readonly stops: readonly Rgb[] }
  | { readonly kind: "image-indeterminate" };

export type ContrastInput = {
  readonly selector: string;
  readonly color: Rgb;
  readonly backdrop: Backdrop;
  readonly fontSizePx: number;
  readonly fontWeight: number;
};

/** Checks #1 (contrast) and #2 (text-over-art legibility) — one function, because they're the same
 *  math over a different backdrop shape. `image-indeterminate` and a failing `gradient` both report as
 *  rule "text-over-art" (OUR #1 defect class — text bled unreadable over a picture), weighted P0/P1; a
 *  failing flat background reports as plain "contrast" at P1. */
export function checkContrast(input: ContrastInput): Finding | null {
  const large = isLargeText(input.fontSizePx, input.fontWeight);
  const minRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;

  if (input.backdrop.kind === "image-indeterminate") {
    return {
      rule: "text-over-art",
      severity: "P1",
      selector: input.selector,
      value: "backdrop is a background-image — contrast indeterminate",
      message:
        "text sits over an image with no flat/gradient color to check against — verify legibility " +
        "manually (the #1 defect class: text bled unreadable over a picture)",
    };
  }

  if (input.backdrop.kind === "gradient") {
    const ratios = input.backdrop.stops.map((stop) => contrastRatio(input.color, stop));
    const worst = Math.min(...ratios);
    if (worst < minRatio) {
      return {
        rule: "text-over-art",
        severity: "P0",
        selector: input.selector,
        value: `${worst.toFixed(2)}:1 worst-stop (need ${minRatio}:1)`,
        message:
          "text over a gradient backdrop fails contrast against at least one color stop — the " +
          "'text bled unreadable over the picture' defect",
      };
    }
    return null;
  }

  const ratio = contrastRatio(input.color, input.backdrop.color);
  if (ratio < minRatio) {
    return {
      rule: "contrast",
      severity: "P1",
      selector: input.selector,
      value: `${ratio.toFixed(2)}:1 (need ${minRatio}:1)`,
      message: `text/background contrast is ${ratio.toFixed(2)}:1, below WCAG AA's ${minRatio}:1 floor for ${large ? "large" : "normal"} text`,
    };
  }
  return null;
}

// ── Distorted / stretched image ─────────────────────────────────────────────

const DISTORTION_THRESHOLD_PCT = 3;
const DISTORTION_SEVERE_PCT = 15;
const PCT_MULTIPLIER = 100;

export type ImageDistortionInput = {
  readonly selector: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  /** Computed `object-fit` ("fill" is the CSS default and the only mode that STRETCHES to the box —
   *  "cover"/"contain" deliberately crop/letterbox while preserving the source aspect, so a box/natural
   *  aspect mismatch under those modes is by design, not a squish bug). */
  readonly objectFit: string;
};

const NON_STRETCHING_OBJECT_FITS = new Set(["cover", "contain"]);

export function checkImageDistortion(input: ImageDistortionInput): Finding | null {
  const { naturalWidth, naturalHeight, renderedWidth, renderedHeight, selector, objectFit } = input;
  if (naturalWidth <= 0 || naturalHeight <= 0 || renderedWidth <= 0 || renderedHeight <= 0) {
    return null;
  }
  if (NON_STRETCHING_OBJECT_FITS.has(objectFit)) {
    return null;
  }
  const naturalRatio = naturalWidth / naturalHeight;
  const renderedRatio = renderedWidth / renderedHeight;
  const deviationPct = (Math.abs(renderedRatio - naturalRatio) / naturalRatio) * PCT_MULTIPLIER;
  if (deviationPct <= DISTORTION_THRESHOLD_PCT) {
    return null;
  }
  return {
    rule: "distorted-image",
    severity: deviationPct >= DISTORTION_SEVERE_PCT ? "P1" : "P2",
    selector,
    value: `${deviationPct.toFixed(1)}% aspect deviation (natural ${naturalRatio.toFixed(2)}, rendered ${renderedRatio.toFixed(2)})`,
    message:
      "image is squished/stretched — rendered aspect ratio doesn't match its source; use object-fit " +
      "or fix explicit width/height",
  };
}

// ── Tap targets ──────────────────────────────────────────────────────────────
// The relevant floor is pointer-conditional — WCAG has two target-size criteria and which one bites
// depends on what's driving the page. A coarse/touch pointer owes the AAA 2.5.5 44px target; a fine
// pointer (mouse) only owes the AA 2.5.8 24px minimum. This mirrors the app's own token split (D62 P1 /
// theme.css's `@media (pointer: fine)` override, where control heights drop to 32/34/40px on desktop).
// Judging a fine-pointer render against the 44px touch number is a category error: it flags deliberate
// desktop density as a defect. So `checkTapTarget` takes the pointer type the page was measured under.

const TAP_COARSE_WARN_PX = 44; // WCAG 2.5.5 (AAA) — recommended touch target on a coarse pointer
const TAP_COARSE_FAIL_PX = 32; // below this even a coarse pointer can't reliably hit — hard floor
const TAP_FINE_MIN_PX = 24; // WCAG 2.5.8 (AA) — the only target-size floor a mouse actually owes

export type TapTargetInput = {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
};

export function checkTapTarget(input: TapTargetInput, pointerCoarse: boolean): Finding | null {
  const shortSide = Math.min(input.width, input.height);
  if (pointerCoarse) {
    if (shortSide >= TAP_COARSE_WARN_PX) {
      return null;
    }
    const severity: Severity = shortSide < TAP_COARSE_FAIL_PX ? "P1" : "P2";
    const floor =
      severity === "P1"
        ? `${TAP_COARSE_FAIL_PX}px hard floor`
        : `${TAP_COARSE_WARN_PX}px recommended minimum`;
    return {
      rule: "tap-target",
      severity,
      selector: input.selector,
      value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
      message: `interactive element's short side is ${Math.round(shortSide)}px — below the ${floor}; grow the hit area to ≥${TAP_COARSE_WARN_PX}×${TAP_COARSE_WARN_PX}px`,
    };
  }
  // Fine pointer (mouse): only the AA 24px floor applies — the 32/34/40px desktop control scale passes
  // by design, so nothing above 24px is flagged; a genuinely tiny control still fails hard.
  if (shortSide >= TAP_FINE_MIN_PX) {
    return null;
  }
  return {
    rule: "tap-target",
    severity: "P1",
    selector: input.selector,
    value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
    message: `interactive element's short side is ${Math.round(shortSide)}px — below WCAG AA's ${TAP_FINE_MIN_PX}px minimum (fine pointer); grow the hit area to ≥${TAP_FINE_MIN_PX}×${TAP_FINE_MIN_PX}px`,
  };
}

// ── ARIA navigability ────────────────────────────────────────────────────────

export type AccessibleNameInput = {
  readonly selector: string;
  readonly tag: string;
  readonly hasVisibleText: boolean;
  readonly ariaLabel: string | null;
  readonly ariaLabelledbyText: string | null;
  readonly title: string | null;
  readonly altText: string | null;
};

/** Precedence mirrors the browser's accessible-name computation (aria-labelledby / aria-label / visible
 *  text / title / alt) — we don't need the exact order here since ANY of them satisfies "has a name";
 *  order only matters when computing what the name IS, which the probe doesn't need. */
export function checkAccessibleName(input: AccessibleNameInput): Finding | null {
  const hasName =
    input.hasVisibleText ||
    Boolean(input.ariaLabel?.trim()) ||
    Boolean(input.ariaLabelledbyText?.trim()) ||
    Boolean(input.title?.trim()) ||
    Boolean(input.altText?.trim());
  if (hasName) {
    return null;
  }
  return {
    rule: "aria-name",
    severity: "P1",
    selector: input.selector,
    value: "no accessible name",
    message: `<${input.tag}> is interactive but exposes no accessible name — add visible text, aria-label, aria-labelledby, title, or alt`,
  };
}

export type LandmarkInput = { readonly main: boolean };

export function checkMainLandmark(input: LandmarkInput): Finding | null {
  if (input.main) {
    return null;
  }
  return {
    rule: "landmark-missing",
    severity: "P2",
    selector: "body",
    value: "no <main>/role=main",
    message: 'page has no main landmark — wrap primary content in <main> or role="main"',
  };
}

export type TabIndexInput = { readonly selector: string; readonly tabIndex: number };

export function checkTabIndexSmell(input: TabIndexInput): Finding | null {
  if (input.tabIndex <= 0) {
    return null;
  }
  return {
    rule: "tabindex-positive",
    severity: "P2",
    selector: input.selector,
    value: `tabindex=${input.tabIndex}`,
    message:
      "positive tabindex overrides natural DOM order — breaks predictable keyboard navigation; " +
      'use tabindex="0" and reorder in the DOM instead',
  };
}

// ── Cheap in-DOM antipatterns ────────────────────────────────────────────────

const Z_INDEX_THRESHOLD = 999;
const Z_INDEX_EGREGIOUS = 9999;

export type ZIndexInput = { readonly selector: string; readonly zIndex: number };

export function checkZIndex(input: ZIndexInput): Finding | null {
  if (input.zIndex < Z_INDEX_THRESHOLD) {
    return null;
  }
  return {
    rule: "z-index-escalation",
    severity: input.zIndex >= Z_INDEX_EGREGIOUS ? "P2" : "P3",
    selector: input.selector,
    value: `z-index: ${input.zIndex}`,
    message: `raw z-index ${input.zIndex} (≥${Z_INDEX_THRESHOLD}) — a stacking-context arms race; use the design system's layer tokens instead`,
  };
}

export type NestedCardInput = { readonly selector: string; readonly isNested: boolean };

export function checkNestedCard(input: NestedCardInput): Finding | null {
  if (!input.isNested) {
    return null;
  }
  return {
    rule: "nested-card",
    severity: "P3",
    selector: input.selector,
    value: "card inside card",
    message:
      "a card-like element (shadow/border + radius/background) is nested inside another — flatten to one visual container",
  };
}

export type GradientTextInput = { readonly selector: string; readonly hasGradientText: boolean };

export function checkGradientText(input: GradientTextInput): Finding | null {
  if (!input.hasGradientText) {
    return null;
  }
  return {
    rule: "gradient-text",
    severity: "P3",
    selector: input.selector,
    value: "background-clip: text",
    message:
      "gradient-clipped text — contrast against every backdrop it can appear on is indeterminate; verify manually or use a solid color",
  };
}

export type AnimatedImgHoverInput = {
  readonly selector: string;
  readonly hasHoverAnimation: boolean;
};

export function checkAnimatedImgHover(input: AnimatedImgHoverInput): Finding | null {
  if (!input.hasHoverAnimation) {
    return null;
  }
  return {
    rule: "animated-img-hover",
    severity: "P3",
    selector: input.selector,
    value: "hover transform/transition",
    message:
      "image animates (scale/rotate/translate) on hover — confirm this is intentional, not inherited card-hover motion",
  };
}

// ── Aggregation ──────────────────────────────────────────────────────────────
// Raw facts the in-page walker gathers (design-audit.ts) — plain data, zero DOM types, so this whole
// module (and `collectFindings` below) stays importable/testable without a browser.

export type RawSamples = {
  readonly texts: readonly ContrastInput[];
  readonly images: readonly ImageDistortionInput[];
  readonly tapTargets: readonly TapTargetInput[];
  readonly accessibleNames: readonly AccessibleNameInput[];
  readonly mainLandmarkPresent: boolean;
  readonly tabIndexes: readonly TabIndexInput[];
  readonly zIndexes: readonly ZIndexInput[];
  readonly nestedCards: readonly NestedCardInput[];
  readonly gradientTexts: readonly GradientTextInput[];
  readonly animatedImgHovers: readonly AnimatedImgHoverInput[];
  /** Whether the page was measured under `(pointer: coarse)` — selects the tap-target floor (44px vs 24px). */
  readonly pointerCoarse: boolean;
};

/** Runs one check over one sample array, pushing every non-null Finding — factored out purely to keep
 *  `collectFindings` a flat dispatch table instead of ten hand-rolled loops (cognitive-complexity gate). */
function pushFindings<T>(
  findings: Finding[],
  items: readonly T[],
  check: (item: T) => Finding | null,
): void {
  for (const item of items) {
    const f = check(item);
    if (f !== null) {
      findings.push(f);
    }
  }
}

/** Runs every check over a raw-sample bundle — the one place that fans a page's facts out to findings.
 *  Still pure (no I/O): a test can hand-build a `RawSamples` and assert on the returned list. */
export function collectFindings(samples: RawSamples): Finding[] {
  const findings: Finding[] = [];
  pushFindings(findings, samples.texts, checkContrast);
  pushFindings(findings, samples.images, checkImageDistortion);
  pushFindings(findings, samples.tapTargets, (t) => checkTapTarget(t, samples.pointerCoarse));
  pushFindings(findings, samples.accessibleNames, checkAccessibleName);
  const landmark = checkMainLandmark({ main: samples.mainLandmarkPresent });
  if (landmark !== null) {
    findings.push(landmark);
  }
  pushFindings(findings, samples.tabIndexes, checkTabIndexSmell);
  pushFindings(findings, samples.zIndexes, checkZIndex);
  pushFindings(findings, samples.nestedCards, checkNestedCard);
  pushFindings(findings, samples.gradientTexts, checkGradientText);
  pushFindings(findings, samples.animatedImgHovers, checkAnimatedImgHover);
  return findings;
}
