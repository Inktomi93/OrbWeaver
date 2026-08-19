// Pure, DOM-free classification logic for design-audit.ts — takes plain data shapes mirroring
// getComputedStyle/getBoundingClientRect output and returns Findings. Every threshold is a
// fixed, cited number. This split keeps the decision logic unit-testable without a browser;
// design-audit-walker.ts's in-page walker gathers the raw facts, this module classifies them.
//
// WCAG contrast formula + large-text thresholds are standard WCAG 2.x math, not reinvented.
//
// PROVENANCE / ATTRIBUTION: every check whose Finding carries `origin: "impeccable"` adapts a
// detection recipe from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs + registry/antipatterns.mjs — Copyright 2025 Paul Bakaus,
// Apache License 2.0), MODIFIED for orbweaver: thresholds re-bound to the live token ramp
// (`@orb/ui/tokens`), owner-sacred effect axes exempted, severities mapped to our P0–P3.
// Full 59-rule triage + license statement:
// .claude/skills/side-eye-design-review/reference/impeccable-adoption.md

import { TOKENS } from "@orb/ui/tokens";

export type Severity = "P0" | "P1" | "P2" | "P3";

/** Which detector family a rule came from — "impeccable" rules are adaptations (see header). */
export type RuleOrigin = "orbweaver" | "impeccable";

export type Finding = {
  readonly rule: string;
  readonly severity: Severity;
  readonly selector: string;
  readonly value: string;
  readonly message: string;
  readonly origin: RuleOrigin;
};

const SEVERITIES: readonly Severity[] = ["P0", "P1", "P2", "P3"];

export function isValidSeverity(s: string): s is Severity {
  return (SEVERITIES as readonly string[]).includes(s);
}

/** True when `sev` is at least as severe as `floor` (P0 is the worst, P3 the mildest). */
export function isAtOrAboveSeverity(sev: Severity, floor: Severity): boolean {
  return SEVERITIES.indexOf(sev) <= SEVERITIES.indexOf(floor);
}

// ── Token-ramp bindings (the DESIGN.md-equivalent — live values, never a prose mirror) ──────

const REM_PX = 16;
/** The smallest ratified type step — `text.micro` (10.5px, the UIP-103 micro-caps voice).
 *  Text below this is off the ramp AND illegible: the `text-below-ramp` floor. */
export const TEXT_MICRO_PX = Number.parseFloat(TOKENS["text.micro"].value) * REM_PX;
/** Measurement slack so text AT the micro step never false-fires (sub-pixel rounding). */
const RAMP_FLOOR_EPSILON_PX = 0.2;
/** Interactive text floor — deliberately ABOVE the micro step (impeccable's "being on the ramp
 *  doesn't launder legibility" clause, kept for interactive text only). */
export const INTERACTIVE_TEXT_FLOOR_PX = 11;
/** The smallest ratified leading step — `leading.label` (1.25). Below it is `tight-leading`.
 *  (Impeccable uses 1.3; ours is ramp-bound so ratified label-voice text stays legal.) */
export const LEADING_FLOOR = Number(TOKENS["leading.label"].value);
/** Rounding slack on the leading floor (#233). `getComputedStyle` hands back a TRUNCATED line-height
 *  string — at `--font-scale: 1.25` the body step measures 13.125px and Chrome reports "16.4062px" for
 *  a line-height that is exactly 16.40625px, so the ratio arrives as 1.2499657 and a ramp-legal
 *  paragraph fires `tight-leading` against a floor it actually sits on (three such findings on the
 *  home reading arm, all retracted in-report). Chrome truncates at 4 decimals, so the worst error is
 *  bounded by 1e-4 / fontSizePx — well inside this; anything genuinely tight is ≥ 0.01 below the floor. */
const LEADING_FLOOR_EPSILON = 0.005;

const GENERIC_FONT_TOKENS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

const QUOTE_TRIM_RE = /^['"]|['"]$/g;

function stackFaces(stack: string): string[] {
  return stack
    .split(",")
    .map((f) => f.trim().replace(QUOTE_TRIM_RE, "").toLowerCase())
    .filter((f) => f.length > 0 && !GENERIC_FONT_TOKENS.has(f));
}

/** Every non-generic face the token stacks name (`font.sans` + `font.mono`) — the ONLY faces a
 *  rendered page may resolve. Anything else is `off-theme-font`. */
export const RAMP_FONT_FACES: ReadonlySet<string> = new Set([...stackFaces(TOKENS["font.sans"].value), ...stackFaces(TOKENS["font.mono"].value)]);

// ── Contrast (WCAG) ──────────────────────────────────────────────────────────

export type Rgb = { readonly r: number; readonly g: number; readonly b: number; readonly a?: number };

// sRGB→linear gamma correction (WCAG 2.x relative-luminance formula).
const RGB_MAX_CHANNEL = 255;
const SRGB_GAMMA_THRESHOLD = 0.039_28;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;

function linearizeChannel(channel: number): number {
  const c = channel / RGB_MAX_CHANNEL;
  return c <= SRGB_GAMMA_THRESHOLD ? c / SRGB_LINEAR_DIVISOR : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA_EXPONENT;
}

const LUMINANCE_R_WEIGHT = 0.2126;
const LUMINANCE_G_WEIGHT = 0.7152;
const LUMINANCE_B_WEIGHT = 0.0722;

export function relativeLuminance(c: Rgb): number {
  return LUMINANCE_R_WEIGHT * linearizeChannel(c.r) + LUMINANCE_G_WEIGHT * linearizeChannel(c.g) + LUMINANCE_B_WEIGHT * linearizeChannel(c.b);
}

const CONTRAST_OFFSET = 0.05;

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + CONTRAST_OFFSET) / (Math.min(la, lb) + CONTRAST_OFFSET);
}

/** Channel spread — the cheap chroma proxy the adapted impeccable color rules use. */
export function rgbChroma(c: Rgb): number {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

// CSS px per pt (96dpi/72pt) — WCAG's "18pt"/"14pt bold" large-text carve-out.
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
const PT_TO_PX = CSS_PIXELS_PER_INCH / POINTS_PER_INCH;
const WCAG_LARGE_TEXT_PT = 18;
const WCAG_LARGE_BOLD_TEXT_PT = 14;
const LARGE_TEXT_PX = WCAG_LARGE_TEXT_PT * PT_TO_PX; // 24px
const LARGE_BOLD_TEXT_PX = WCAG_LARGE_BOLD_TEXT_PT * PT_TO_PX; // ~18.67px
const BOLD_WEIGHT = 700;

export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= LARGE_TEXT_PX || (fontSizePx >= LARGE_BOLD_TEXT_PX && fontWeight >= BOLD_WEIGHT);
}

export const NORMAL_MIN_RATIO = 4.5;
export const LARGE_MIN_RATIO = 3;

/** A gradient stop whose alpha is below this can't be trusted for worst-stop contrast math —
 *  what shows through underneath is unknown, so the check REFUSES (indeterminate) instead of
 *  producing a fake ratio. (The old walker's alpha-blind stop math was the documented
 *  "skips gradient backgrounds" blind spot.) */
const OPAQUE_STOP_MIN_ALPHA = 0.9;

/** Resolved backdrop behind a text node — `flat` (solid ancestor bg), `gradient` (worst-stop
 *  ratio over OPAQUE stops; translucent stops refuse as indeterminate),
 *  `image-indeterminate` (a url() layer — incl. gradient-over-image composites — has no cheap
 *  DOM-only pixel sample, so it's flagged rather than silently passed), or `unresolved` — the DOM
 *  walk found no trustworthy base at all (issue #218).
 *
 *  `unresolved` IS NOT A VERDICT AND MUST NOT REACH A RATIO. It means the walker knows it cannot know:
 *  either nothing opaque backs the chain, or a fixed/absolute PAINT LAYER (the app's wallpaper photo)
 *  sits between the opaque base it found and the glyph. design-audit.ts settles these by sampling the
 *  element's real pixels (`resolvePixelBackdrops`) and rewriting the sample to `flat` before
 *  `collectFindings` ever sees it; one that survives to here is one the runner REFUSED (off-screen box,
 *  failed shot) and reported as an explicit NO-VERDICT row, so the checks below stay silent rather than
 *  minting a number from `fallback`. `fallback` is the pre-#218 fabricated composite, kept ONLY for the
 *  non-verdict tells (the dark-glow "is this backdrop dark" question). */
export type Backdrop =
  | { readonly kind: "flat"; readonly color: Rgb }
  | { readonly kind: "gradient"; readonly stops: readonly Rgb[] }
  | { readonly kind: "image-indeterminate" }
  | { readonly kind: "unresolved"; readonly reason: "paint-layer-over-base" | "no-opaque-base"; readonly fallback: Rgb };

export type ContrastInput = {
  readonly selector: string;
  readonly color: Rgb;
  readonly backdrop: Backdrop;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  /** Viewport-coordinate box of the text element, present from the live walker (absent in the fixture
   *  sample sets that predate it). The pixel sampler needs it to settle an `unresolved` backdrop. */
  readonly box?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** What the compositor says is painted at this box's visible centre, when it is NOT this element (#211's
   *  test, carried only for `unresolved` samples). Non-null means a pixel sample would measure the
   *  OCCLUDER — the runner refuses the verdict instead. */
  readonly occludedBy?: string | null;
  /** How `backdrop` was arrived at. Absent/`css-resolve` = an authored background the walker resolved;
   *  `pixel-sample` = the runner read the real composited pixels because the walk was `unresolved`. The
   *  distinction is load-bearing for the rules that are about an authored COLOR rather than about
   *  luminance — see checkGrayOnColor. */
  readonly backdropMethod?: "css-resolve" | "pixel-sample";
  /** This text sits inside an `aria-hidden="true"` subtree. It is COLLECTED anyway and every rule over
   *  this sample family judges it, because contrast is a property of PIXELS and a sighted user reads
   *  decorative text exactly as well as announced text (issue #253 — three findings vanished from a scan
   *  the day their host became aria-hidden, without one pixel changing). The flag exists so an
   *  a11y-flavoured rule added here later excludes it EXPLICITLY rather than by an omission nobody can
   *  see. Optional: absent in the fixture sample sets that predate it. */
  readonly ariaHidden?: boolean;
  /** Product of `opacity` over the text element AND its ancestors. Below 1 the glyphs are painted as a
   *  BLEND of `color` and the backdrop (CSS opacity groups the subtree and composites it), while
   *  `color` still reports the undimmed value — so the ratio must be measured on the composite, exactly
   *  as snap's `--contrast` does. Optional because this type also describes samples from an older
   *  walker string (a CT pinning a historical sample set); absent reads as 1, the pre-#188 behavior. */
  readonly foregroundOpacity?: number;
};

/** Below this accumulated opacity the foreground is composited before measuring. Just under 1 so
 *  sub-pixel float noise (0.999…) never triggers a pointless composite. Same constant, same reason, as
 *  snap.ts's FOREGROUND_OPACITY_EPS — the two instruments must not disagree about what "dimmed" is. */
const FOREGROUND_OPACITY_EPS = 0.999;

/** Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of a
 *  glyph painted inside an opacity<1 group. opacity 1 is a no-op; opacity 0 is the pure backdrop. */
function compositeForeground(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  const mix = (f: number, b: number): number => Math.round(opacity * f + (1 - opacity) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

function indeterminateFinding(selector: string, value: string, message: string): Finding {
  return { rule: "text-over-art", severity: "P1", selector, value, message, origin: "orbweaver" };
}

/** Contrast + text-over-art legibility — same math over a different backdrop shape.
 *  `image-indeterminate`/failing `gradient` report as "text-over-art" (P0/P1); a failing flat
 *  background reports as "contrast" at P1. */
export function checkContrast(input: ContrastInput): Finding | null {
  const large = isLargeText(input.fontSizePx, input.fontWeight);
  const minRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const opacity = input.foregroundOpacity ?? 1;
  // Ancestor opacity dims the FOREGROUND: the glyph is a blend of `color` and whatever is behind it.
  // Measuring the authored color is a false PASS the eye can see through (issue #188 — two live lines
  // read 3.68:1 at α0.60 while this check reported nothing). The BACKDROP half needs no adjustment: the
  // walker resolves it from the ancestor chain, which is what shows through.
  const dimmed = opacity < FOREGROUND_OPACITY_EPS;
  const dimNote = dimmed ? ` · dimmed α${opacity.toFixed(2)}` : "";
  const dimmedMessage = dimmed
    ? ` — the glyphs are painted at ${opacity.toFixed(2)} opacity by an ancestor group, so what the eye reads is the composite, not the authored color`
    : "";
  const seenColor = (over: Rgb): Rgb => (dimmed ? compositeForeground(input.color, over, opacity) : input.color);

  // NO VERDICT (issue #218): the runner either pixel-samples this into a `flat` sample before we run, or
  // refuses it out loud in its own report. A ratio against `fallback` is exactly the fiction that put 28
  // false P1s on one transcript, and "text over an art layer" is not a defect claim either — the pixels
  // may be perfectly legible.
  if (input.backdrop.kind === "unresolved") {
    return null;
  }

  if (input.backdrop.kind === "image-indeterminate") {
    return indeterminateFinding(
      input.selector,
      "backdrop is a background-image — contrast indeterminate",
      "text sits over an image with no flat/gradient color to check against — verify legibility manually (the #1 defect class: text bled unreadable over a picture)",
    );
  }

  if (input.backdrop.kind === "gradient") {
    const translucent = input.backdrop.stops.some((stop) => (stop.a ?? 1) < OPAQUE_STOP_MIN_ALPHA);
    if (translucent) {
      return indeterminateFinding(
        input.selector,
        "gradient backdrop has translucent stops — contrast indeterminate",
        "text sits over a gradient with translucent color stops — what composites underneath is unknown, so a worst-stop ratio would be a fake number; verify legibility manually",
      );
    }
    const ratios = input.backdrop.stops.map((stop) => contrastRatio(seenColor(stop), stop));
    const worst = Math.min(...ratios);
    if (worst < minRatio) {
      return {
        rule: "text-over-art",
        severity: "P0",
        selector: input.selector,
        value: `${worst.toFixed(2)}:1 worst-stop (need ${minRatio}:1)${dimNote}`,
        message: "text over a gradient backdrop fails contrast against at least one color stop — the 'text bled unreadable over the picture' defect",
        origin: "orbweaver",
      };
    }
    return null;
  }

  const ratio = contrastRatio(seenColor(input.backdrop.color), input.backdrop.color);
  if (ratio < minRatio) {
    return {
      rule: "contrast",
      severity: "P1",
      selector: input.selector,
      value: `${ratio.toFixed(2)}:1 (need ${minRatio}:1)${dimNote}`,
      message: `text/background contrast is ${ratio.toFixed(2)}:1, below WCAG AA's ${minRatio}:1 floor for ${large ? "large" : "normal"} text${dimmedMessage}`,
      origin: "orbweaver",
    };
  }
  return null;
}

// ── Gray text on a colored background (impeccable `gray-on-color`) ───────────
// Achromatic mid-luminance text over a chromatic backdrop reads washed out — the fix is a
// darker shade of the background's own hue (or a transparency of the text color), never gray.

const GRAY_TEXT_MAX_CHROMA = 20;
const COLORED_BG_MIN_CHROMA = 40;
const GRAY_TEXT_MIN_LUM = 0.05;
const GRAY_TEXT_MAX_LUM = 0.85;

export function checkGrayOnColor(input: ContrastInput): Finding | null {
  // Same NO-VERDICT posture as checkContrast: "gray on a chromatic surface" is a claim about a backdrop
  // color, and an unresolved backdrop has none the walker may assert.
  if (input.backdrop.kind === "image-indeterminate" || input.backdrop.kind === "unresolved") {
    return null;
  }
  // A PIXEL-SAMPLED backdrop answers LUMINANCE, not authorship. This rule's whole remedy — "use a darker
  // shade of the background's own hue" — presumes an authored background color; run against the median of
  // a WALLPAPER PHOTO it minted five P2s about a photograph (measured on the chats surface, issue #218).
  // Contrast still judges those samples: a ratio is exactly what pixels can prove.
  if (input.backdropMethod === "pixel-sample") {
    return null;
  }
  const textLum = relativeLuminance(input.color);
  const isGray = rgbChroma(input.color) < GRAY_TEXT_MAX_CHROMA && textLum > GRAY_TEXT_MIN_LUM && textLum < GRAY_TEXT_MAX_LUM;
  if (!isGray) {
    return null;
  }
  const stops = input.backdrop.kind === "flat" ? [input.backdrop.color] : input.backdrop.stops;
  if (stops.length === 0 || !stops.every((s) => rgbChroma(s) >= COLORED_BG_MIN_CHROMA && (s.a ?? 1) >= OPAQUE_STOP_MIN_ALPHA)) {
    return null;
  }
  return {
    rule: "gray-on-color",
    severity: "P2",
    selector: input.selector,
    value: `gray text (chroma<${GRAY_TEXT_MAX_CHROMA}) on chromatic bg (chroma≥${COLORED_BG_MIN_CHROMA})`,
    message:
      "gray text on a colored background looks washed out — use a darker shade of the background's own hue or a transparency of the text color, not neutral gray",
    origin: "impeccable",
  };
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
  /** Computed `object-fit` — "cover"/"contain" deliberately crop/letterbox and are excluded;
   *  only "fill" stretches to the box. */
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
    message: "image is squished/stretched — rendered aspect ratio doesn't match its source; use object-fit or fix explicit width/height",
    origin: "orbweaver",
  };
}

// ── Broken images (impeccable `broken-image`) ───────────────────────────────

export type BrokenImageInput = { readonly selector: string; readonly reason: "empty-src" | "failed-load" };

export function checkBrokenImage(input: BrokenImageInput): Finding {
  return {
    rule: "broken-image",
    severity: "P1",
    selector: input.selector,
    value: input.reason,
    message:
      input.reason === "empty-src"
        ? "<img> has an empty/missing src — ships as a broken-image box; use a real asset or remove the tag"
        : "<img> failed to load (naturalWidth 0) — a broken-image box is rendering; fix the source or the fallback",
    origin: "impeccable",
  };
}

// ── Tap targets ──────────────────────────────────────────────────────────────
// The relevant floor is pointer-conditional (D62): coarse/touch owes the AAA 2.5.5 44px target,
// fine pointer only owes the AA 2.5.8 24px minimum — `checkTapTarget` takes the pointer type
// the page was measured under so desktop density isn't flagged against the touch floor.

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
    const floor = severity === "P1" ? `${TAP_COARSE_FAIL_PX}px hard floor` : `${TAP_COARSE_WARN_PX}px recommended minimum`;
    return {
      rule: "tap-target",
      severity,
      selector: input.selector,
      value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
      message: `interactive element's short side is ${Math.round(shortSide)}px — below the ${floor}; grow the hit area to ≥${TAP_COARSE_WARN_PX}×${TAP_COARSE_WARN_PX}px`,
      origin: "orbweaver",
    };
  }
  if (shortSide >= TAP_FINE_MIN_PX) {
    return null;
  }
  return {
    rule: "tap-target",
    severity: "P1",
    selector: input.selector,
    value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
    message: `interactive element's short side is ${Math.round(shortSide)}px — below WCAG AA's ${TAP_FINE_MIN_PX}px minimum (fine pointer); grow the hit area to ≥${TAP_FINE_MIN_PX}×${TAP_FINE_MIN_PX}px`,
    origin: "orbweaver",
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

/** Any of aria-labelledby/aria-label/visible text/title/alt satisfies "has a name"; the probe
 *  doesn't need the browser's exact precedence order since it never computes what the name IS. */
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
    origin: "orbweaver",
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
    origin: "orbweaver",
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
    message: 'positive tabindex overrides natural DOM order — breaks predictable keyboard navigation; use tabindex="0" and reorder in the DOM instead',
    origin: "orbweaver",
  };
}

// ── Heading order (impeccable `skipped-heading`; UIP §13.10 N7 is law here) ──

export type HeadingSample = { readonly level: number; readonly text: string };

export function checkHeadingOrder(headings: readonly HeadingSample[]): Finding[] {
  const findings: Finding[] = [];
  let prevLevel = 0;
  let prevText = "";
  for (const h of headings) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      findings.push({
        rule: "skipped-heading",
        severity: "P2",
        selector: `h${h.level}`,
        value: `h${prevLevel} "${prevText}" → h${h.level} "${h.text}"`,
        message: `heading level skips from h${prevLevel} to h${h.level} (missing h${prevLevel + 1}) — screen readers navigate by heading hierarchy (UIP §13.10 N7)`,
        origin: "impeccable",
      });
    }
    prevLevel = h.level;
    prevText = h.text;
  }
  return findings;
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
    origin: "orbweaver",
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
    message: "a card-like element (shadow/border + radius/background) is nested inside another — flatten to one visual container",
    origin: "orbweaver",
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
    message: "gradient-clipped text — contrast against every backdrop it can appear on is indeterminate; verify manually or use a solid color",
    origin: "orbweaver",
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
    message: "image animates (scale/rotate/translate) on hover — confirm this is intentional, not inherited card-hover motion",
    origin: "orbweaver",
  };
}

// ── Typography & copy-surface floors (impeccable quality family, ramp-bound) ─

export type TextStyleInput = {
  readonly selector: string;
  readonly tag: string;
  /** Length of the element's OWN text nodes (trimmed, whitespace-collapsed). */
  readonly directTextLen: number;
  /** Length of the whole subtree's text — the line-length estimator's basis. */
  readonly totalTextLen: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number | null;
  readonly letterSpacingPx: number;
  readonly textTransform: string;
  /** The element's own text RENDERS as caps — typed that way, not just `text-transform: uppercase`.
   *  Optional because this type also describes samples from an older walker string (a CT pinning a
   *  historical sample set); absent reads as "not caps", i.e. the pre-#148 behavior. */
  readonly capsText?: boolean;
  readonly textAlign: string;
  readonly hyphens: string;
  readonly rectWidth: number;
  /** p/li/td/th/dd/blockquote/figcaption — the prose tags line-length judges. */
  readonly isProseTag: boolean;
  readonly isHeading: boolean;
  /** This text is an interactive control's PRIMARY label (its direct text ≈ the control's whole
   *  text) — not merely text inside an interactive ancestor: a micro-voice caption inside a large
   *  clickable card is the ratified gloss voice and does NOT owe the 11px control floor. */
  readonly interactive: boolean;
  /** Inside pre/code/kbd/samp/var/svg — glyphs that are DATA or GEOMETRY, which the type ramp does not
   *  govern. `aria-hidden` was in this selector until issue #253 and must never return: it is an
   *  accessibility-tree fact, and using it as a type-floor exemption silently excused every
   *  decorative-but-rendered string in the product. */
  readonly codeContext: boolean;
  /** Screen-reader-only text — exempt from everything here (it paints no pixels to judge). Either
   *  shape: a clipped visually-hidden state (`clip-path: inset(50%)` / `clip: rect(0,0,0,0)` over a
   *  clipping overflow — the `sr-only` posture, which keeps a FULL-SIZE box), or a ≤2px plumbing box. */
  readonly srOnly: boolean;
  /** Inside an `aria-hidden="true"` subtree — JUDGED ANYWAY by every rule here (issue #253). This family
   *  is entirely VISUAL (size, leading, tracking, measure, caps, justification): all of it is pixels a
   *  sighted user reads whether or not a screen reader announces it, and the opposite posture cost three
   *  live findings the day their host was correctly marked aria-hidden. Contrast with `srOnly`, which IS
   *  an exemption — clipped text paints no pixels at all. Optional: absent in older fixture sample sets. */
  readonly ariaHidden?: boolean;
};

const LINE_LENGTH_TEXT_MIN = 80;
const LINE_LENGTH_EST_MAX = 85; // estimated chars/line = rectWidth / (fontSize × 0.5)
const CHAR_WIDTH_FONT_RATIO = 0.5;
const TIGHT_LEADING_TEXT_MIN = 50;
const ALL_CAPS_TEXT_MIN = 30;
const TRACKING_TEXT_MIN = 20;
const WIDE_TRACKING_EM = 0.05;
const CRUSHED_TRACKING_EM = -0.045; // skill §2 floor is −0.04em; fire strictly below it
const MIN_FLAGGABLE_TEXT = 2;

function checkTypeFloor(input: TextStyleInput): Finding | null {
  if (input.codeContext || input.directTextLen < MIN_FLAGGABLE_TEXT || input.fontSizePx <= 0) {
    return null;
  }
  if (input.fontSizePx < TEXT_MICRO_PX - RAMP_FLOOR_EPSILON_PX) {
    return {
      rule: "text-below-ramp",
      severity: "P2",
      selector: input.selector,
      value: `${input.fontSizePx}px (ramp floor ${TEXT_MICRO_PX}px)`,
      message: `rendered text is ${input.fontSizePx}px — below the smallest ratified type step (text.micro ${TEXT_MICRO_PX}px); off the token ramp AND a legibility failure`,
      origin: "impeccable",
    };
  }
  if (input.interactive && input.fontSizePx < INTERACTIVE_TEXT_FLOOR_PX) {
    return {
      rule: "undersized-ui-text",
      severity: "P2",
      selector: input.selector,
      value: `${input.fontSizePx}px interactive text (floor ${INTERACTIVE_TEXT_FLOOR_PX}px)`,
      message: `interactive text is ${input.fontSizePx}px — below the ${INTERACTIVE_TEXT_FLOOR_PX}px functional floor; being on the type ramp does not launder legibility for a control`,
      origin: "impeccable",
    };
  }
  return null;
}

function checkLineLength(input: TextStyleInput): Finding | null {
  if (!input.isProseTag || input.totalTextLen <= LINE_LENGTH_TEXT_MIN || input.rectWidth <= 0 || input.fontSizePx <= 0) {
    return null;
  }
  const estCharsPerLine = input.rectWidth / (input.fontSizePx * CHAR_WIDTH_FONT_RATIO);
  if (estCharsPerLine <= LINE_LENGTH_EST_MAX) {
    return null;
  }
  return {
    rule: "line-length",
    severity: "P3",
    selector: input.selector,
    value: `~${Math.round(estCharsPerLine)} chars/line`,
    message: `prose line measures ~${Math.round(estCharsPerLine)} chars — beyond ~80 the eye loses the line-return; cap the measure (65–75ch, skill §2)`,
    origin: "impeccable",
  };
}

function checkTightLeading(input: TextStyleInput): Finding | null {
  if (input.directTextLen <= TIGHT_LEADING_TEXT_MIN || input.isHeading || input.lineHeightPx === null || input.fontSizePx <= 0) {
    return null;
  }
  const ratio = input.lineHeightPx / input.fontSizePx;
  // The epsilon is the instrument's own rounding allowance, not a lowered floor — see LEADING_FLOOR_EPSILON.
  if (ratio <= 0 || ratio >= LEADING_FLOOR - LEADING_FLOOR_EPSILON) {
    return null;
  }
  return {
    rule: "tight-leading",
    severity: "P3",
    selector: input.selector,
    value: `line-height ${ratio.toFixed(2)}× (floor ${LEADING_FLOOR})`,
    message: `multi-line text at ${ratio.toFixed(2)}× leading — below the smallest ratified leading step (leading.label ${LEADING_FLOOR}); lines have no room to breathe`,
    origin: "impeccable",
  };
}

function checkJustified(input: TextStyleInput): Finding | null {
  if (input.directTextLen === 0 || input.textAlign !== "justify" || input.hyphens === "auto") {
    return null;
  }
  return {
    rule: "justified-text",
    severity: "P3",
    selector: input.selector,
    value: "text-align: justify without hyphens: auto",
    message: "justified text without hyphenation creates rivers of white — use text-align: left, or enable hyphens: auto if justification is required",
    origin: "impeccable",
  };
}

function checkAllCaps(input: TextStyleInput): Finding | null {
  if (input.directTextLen <= ALL_CAPS_TEXT_MIN || input.textTransform !== "uppercase" || input.isHeading) {
    return null;
  }
  return {
    rule: "all-caps-body",
    severity: "P3",
    selector: input.selector,
    value: `uppercase on ${input.directTextLen} chars`,
    message: "long uppercase passages kill word shapes — reserve caps for short labels (the micro-caps voice is short by law); set body text in sentence case",
    origin: "impeccable",
  };
}

/** Is this text SET IN CAPS as the reader sees it? Wide tracking is the ratified partner of the micro-caps
 *  label voice (tracking.micro 0.08em + text.micro + weight 600 + caps, density spec §2.3), so the caps
 *  exemption must key on the RENDERED result. Keying it on `text-transform` alone — the rule as born — read
 *  a kicker whose caps were TYPED as running text and flagged the ratified voice itself (issue #148 item 4;
 *  measured 4× on one panel). Long caps passages remain covered: that is `all-caps-body`'s job. */
function rendersAsCaps(input: TextStyleInput): boolean {
  return input.textTransform === "uppercase" || input.capsText === true;
}

function checkTracking(input: TextStyleInput): Finding[] {
  if (input.directTextLen <= TRACKING_TEXT_MIN || input.fontSizePx <= 0 || input.letterSpacingPx === 0) {
    return [];
  }
  const findings: Finding[] = [];
  const trackingEm = input.letterSpacingPx / input.fontSizePx;
  if (!rendersAsCaps(input) && trackingEm > WIDE_TRACKING_EM) {
    findings.push({
      rule: "wide-tracking",
      severity: "P3",
      selector: input.selector,
      value: `letter-spacing ${trackingEm.toFixed(2)}em`,
      message: `letter-spacing ${trackingEm.toFixed(2)}em on running text disrupts character groupings — wide tracking is for short uppercase labels only (tracking.micro pairs with caps)`,
      origin: "impeccable",
    });
  }
  if (trackingEm <= CRUSHED_TRACKING_EM) {
    findings.push({
      rule: "crushed-tracking",
      severity: "P3",
      selector: input.selector,
      value: `letter-spacing ${trackingEm.toFixed(2)}em`,
      message: `letter-spacing ${trackingEm.toFixed(2)}em is past the −0.04em floor (skill §2) — characters collide; tighten display type optically, not destructively`,
      origin: "impeccable",
    });
  }
  return findings;
}

export function checkTextStyle(input: TextStyleInput): Finding[] {
  if (input.srOnly) {
    return [];
  }
  const findings: Finding[] = [];
  const singles = [checkTypeFloor(input), checkLineLength(input), checkTightLeading(input), checkJustified(input), checkAllCaps(input)];
  for (const f of singles) {
    if (f !== null) {
      findings.push(f);
    }
  }
  findings.push(...checkTracking(input));
  return findings;
}

// ── Accent borders (impeccable `side-tab` / `border-accent-on-rounded`) ──────

export type AccentBorderInput = {
  readonly selector: string;
  readonly tag: string;
  readonly widths: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly colors: {
    readonly top: Rgb | null;
    readonly right: Rgb | null;
    readonly bottom: Rgb | null;
    readonly left: Rgb | null;
  };
  readonly radius: number;
  readonly badgeLike: boolean;
  readonly tabContext: boolean;
  readonly statusContext: boolean;
};

const ACCENT_BORDER_MIN_CHROMA = 25;
const ACCENT_BORDER_MIN_ALPHA = 0.5;
const ACCENT_BORDER_MIN_PX = 2;
const ACCENT_DOMINANCE_FACTOR = 2;
const HAIRLINE_MAX_PX = 1;
const SIDE_TAB_BARE_MIN_PX = 3;
const HORIZONTAL_BAND_MAX_PX = 12;

const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
type BorderSide = (typeof BORDER_SIDES)[number];

/** One side's verdict: every accent-border rule it violates (a single edge can be two tells at once —
 *  a chromatic side band AND a border fighting the corner radius). */
function classifyAccentSide(input: AccentBorderInput, side: BorderSide): readonly string[] {
  const w = input.widths[side];
  const color = input.colors[side];
  if (w < ACCENT_BORDER_MIN_PX || color === null || (color.a ?? 1) < ACCENT_BORDER_MIN_ALPHA || rgbChroma(color) < ACCENT_BORDER_MIN_CHROMA) {
    return [];
  }
  const maxOther = Math.max(...BORDER_SIDES.filter((s) => s !== side).map((s) => input.widths[s]));
  // Dominant-edge gate: the accent side is ≥2px AND the other sides are hairline or half it.
  if (!(maxOther <= HAIRLINE_MAX_PX || w >= maxOther * ACCENT_DOMINANCE_FACTOR)) {
    return [];
  }
  return side === "left" || side === "right" ? classifyVerticalEdge(input, w) : classifyHorizontalEdge(input, w);
}

/** A left/right accent edge. A RADIUS MAKES IT BOTH TELLS (issue #188): the rule as born returned
 *  "side-tab" alone here, so the live home resume card — a 3px accent edge on a 10px-radius panel, the
 *  textbook shape of BOTH §6 bans — could never report `border-accent-on-rounded`, which was reachable
 *  from a top/bottom edge only. A border fighting a rounded corner does not care which corner it hits. */
function classifyVerticalEdge(input: AccentBorderInput, w: number): readonly string[] {
  if (input.badgeLike) {
    return [];
  }
  if (input.radius > 0) {
    return ["border-accent-on-rounded", "side-tab"];
  }
  return w >= SIDE_TAB_BARE_MIN_PX ? ["side-tab"] : [];
}

/** A top/bottom accent edge: rounded ⇒ the corner-fighting tell; otherwise a bare 3–12px chromatic band,
 *  with tab underlines exempt (an active-tab indicator is the affordance, not a decoration). */
function classifyHorizontalEdge(input: AccentBorderInput, w: number): readonly string[] {
  if (input.radius > 0) {
    return ["border-accent-on-rounded"];
  }
  if (!input.tabContext && w >= SIDE_TAB_BARE_MIN_PX && w <= HORIZONTAL_BAND_MAX_PX) {
    return ["side-tab"];
  }
  return [];
}

export function checkAccentBorder(input: AccentBorderInput): Finding[] {
  // A live status/alert region wears a colored single-edge border as a severity accent.
  if (input.statusContext) {
    return [];
  }
  const findings: Finding[] = [];
  const seenRules = new Set<string>();
  for (const side of BORDER_SIDES) {
    for (const rule of classifyAccentSide(input, side)) {
      if (seenRules.has(rule)) {
        continue;
      }
      seenRules.add(rule);
      findings.push({
        rule,
        severity: "P3",
        selector: input.selector,
        value: `border-${side}: ${input.widths[side]}px${input.radius > 0 ? ` + radius ${input.radius}px` : ""}`,
        message:
          rule === "side-tab"
            ? "a thick chromatic accent border on one edge of a card is the most recognizable generated-UI tell — use a subtler accent or remove it"
            : "a thick accent border fighting rounded corners — remove the border or the radius; they contradict each other",
        origin: "impeccable",
      });
    }
  }
  return findings;
}

// ── Chromatic glow shadows (impeccable `dark-glow`, sanctioned axes exempt) ──
// LIMITATION (deliberate): colors that serialize outside rgb()/rgba() (oklch tokens) are
// SKIPPED, never guessed — the sanctioned owner glow rides token colors on ::before layers and
// must not FP here; a violation authored in raw rgb/hex (the only way past the tokens-only
// source gate) is exactly what still parses.

export type GlowShadowInput = {
  readonly selector: string;
  readonly boxShadow: string;
  readonly textShadow: string;
  readonly backdropColor: Rgb | null;
};

const GLOW_MIN_CHROMA = 30;
const GLOW_MIN_BLUR_PX = 4;
const GLOW_MIN_ALPHA = 0.05;
const GLOW_BLUR_INDEX = 2; // shadow lengths: offset-x, offset-y, blur, [spread]
const DARK_BACKDROP_MAX_LUM = 0.1;
const RGBA_MIN_CHANNELS = 3;
const SHADOW_LAYER_SPLIT_RE = /,(?![^(]*\))/;
const SHADOW_COLOR_RE = /rgba?\([^)]*\)/i;
const SHADOW_LENGTH_RE = /(-?\d*\.?\d+)(px|rem|em)?/g;
const NUMBER_TOKEN_RE = /[\d.]+/g;

function parseRgbTokens(colorFn: string): Rgb | null {
  const nums = colorFn.match(NUMBER_TOKEN_RE);
  if (nums === null || nums.length < RGBA_MIN_CHANNELS) {
    return null;
  }
  return {
    r: Number(nums[0]),
    g: Number(nums[1]),
    b: Number(nums[2]),
    a: nums.length > RGBA_MIN_CHANNELS ? Number(nums[RGBA_MIN_CHANNELS]) : 1,
  };
}

function parseShadowLayer(layer: string): { color: Rgb; lengths: number[] } | null {
  const colorMatch = SHADOW_COLOR_RE.exec(layer);
  if (colorMatch === null) {
    return null;
  }
  const color = parseRgbTokens(colorMatch[0]);
  if (color === null) {
    return null;
  }
  const stripped = `${layer.slice(0, colorMatch.index)} ${layer.slice(colorMatch.index + colorMatch[0].length)}`;
  const lengths: number[] = [];
  SHADOW_LENGTH_RE.lastIndex = 0;
  let m = SHADOW_LENGTH_RE.exec(stripped);
  while (m !== null) {
    let v = Number.parseFloat(m[1] as string);
    if (m[2] === "rem" || m[2] === "em") {
      v *= REM_PX;
    }
    lengths.push(v);
    m = SHADOW_LENGTH_RE.exec(stripped);
  }
  return { color, lengths };
}

/** A chromatic blurred layer's glow classification: "halo" (zero-offset), "dark-bg", or null. */
function classifyGlowLayer(layer: string, onDark: boolean): "halo" | "dark-bg" | null {
  const parsed = parseShadowLayer(layer);
  if (parsed === null || rgbChroma(parsed.color) < GLOW_MIN_CHROMA || (parsed.color.a ?? 1) <= GLOW_MIN_ALPHA) {
    return null;
  }
  const blur = parsed.lengths[GLOW_BLUR_INDEX];
  if (blur === undefined || blur <= GLOW_MIN_BLUR_PX) {
    return null;
  }
  if (parsed.lengths[0] === 0 && parsed.lengths[1] === 0) {
    return "halo";
  }
  return onDark ? "dark-bg" : null;
}

function scanShadowValue(value: string, prop: string, onDark: boolean, selector: string): Finding | null {
  if (value === "") {
    return null;
  }
  for (const layer of value.split(SHADOW_LAYER_SPLIT_RE)) {
    const verdict = classifyGlowLayer(layer, onDark);
    if (verdict === null) {
      continue;
    }
    return {
      rule: "glow-shadow",
      severity: "P3",
      selector,
      value: `${prop}: ${verdict === "halo" ? "zero-offset chromatic halo" : "chromatic blur on dark backdrop"}`,
      message:
        "a colored glow shadow on the element itself — the sanctioned accent glow (--shadow-glow) rides a ::before layer on selected/active carriers only; anything else is the generated-UI glow tell",
      origin: "impeccable",
    };
  }
  return null;
}

export function checkGlowShadow(input: GlowShadowInput): Finding | null {
  const onDark = input.backdropColor !== null && relativeLuminance(input.backdropColor) < DARK_BACKDROP_MAX_LUM;
  return scanShadowValue(input.boxShadow, "box-shadow", onDark, input.selector) ?? scanShadowValue(input.textShadow, "text-shadow", onDark, input.selector);
}

// ── Radial-gradient washes (impeccable `radial-halo` / `radial-spotlight-glow`) ──
// Sanctioned carriers (tagged by the walker off the owner effect axes) are exempt; the same
// rgb/hex-only parsing honesty as glow-shadow applies.

export type RadialGlowInput = {
  readonly selector: string;
  readonly value: string;
  readonly width: number;
  readonly height: number;
  readonly sanctioned: boolean;
};

const RADIAL_MIN_WIDTH_PX = 240;
const RADIAL_MIN_HEIGHT_PX = 160;
const RADIAL_FADE_MAX_ALPHA = 0.05;
const HALO_MIN_STOP_ALPHA = 0.45;
const SPOTLIGHT_MIN_CHROMA = 24;
const SPOTLIGHT_MAX_STOPS = 2;
const RADIAL_MIN_STOPS = 2;
const RADIAL_COLOR_TOKEN_RE = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i;
const TRANSPARENT_KEYWORD_RE = /^transparent$/i;
const RADIAL_GRADIENT_HEAD_RE = /(repeating-)?radial-gradient\(/gi;
const HEX_SHORT_LEN = 3;
const HEX_LONG_LEN = 6;
const HEX_RADIX = 16;
const HEX_PAIR = 2;

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

function hexToRgbNode(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === HEX_SHORT_LEN ? [...h].map((c) => c + c).join("") : h.slice(0, HEX_LONG_LEN);
  return {
    r: Number.parseInt(full.slice(0, HEX_PAIR), HEX_RADIX),
    g: Number.parseInt(full.slice(HEX_PAIR, HEX_PAIR * 2), HEX_RADIX),
    b: Number.parseInt(full.slice(HEX_PAIR * 2, HEX_PAIR * HEX_SHORT_LEN), HEX_RADIX),
    a: 1,
  };
}

type RadialStop = { readonly color: Rgb | null; readonly transparent: boolean };

function parseRadialStopToken(arg: string): RadialStop {
  const tok = RADIAL_COLOR_TOKEN_RE.exec(arg);
  if (tok === null) {
    return { color: null, transparent: false };
  }
  if (TRANSPARENT_KEYWORD_RE.test(tok[0])) {
    return { color: null, transparent: true };
  }
  const color = tok[0].startsWith("#") ? hexToRgbNode(tok[0]) : parseRgbTokens(tok[0]);
  return { color, transparent: color !== null && (color.a ?? 1) <= RADIAL_FADE_MAX_ALPHA };
}

/** Index of the `)` closing the paren opened at `openIdx`, or -1. */
function closingParenIndex(value: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < value.length; i += 1) {
    if (value[i] === "(") {
      depth += 1;
    } else if (value[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** The FIRST non-repeating radial-gradient's color-stop args, or null (repeating-* is a
 *  pattern, not a glow; unparseable color spaces yield too few stops and refuse). */
function extractRadialStopArgs(value: string): string[] | null {
  RADIAL_GRADIENT_HEAD_RE.lastIndex = 0;
  let g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  while (g !== null) {
    if (g[1] === undefined) {
      const open = value.indexOf("(", g.index);
      const end = closingParenIndex(value, open);
      if (end < 0) {
        return null;
      }
      const args = splitTopLevelCommas(value.slice(open + 1, end)).filter((a) => RADIAL_COLOR_TOKEN_RE.test(a));
      return args.length >= RADIAL_MIN_STOPS ? args : null;
    }
    g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  }
  return null;
}

/** True when the gradient's LAST stop fades out (transparent / near-zero alpha) — a gradient
 *  between two visible surfaces is a background, not a floating glow. */
function fadesOut(stops: readonly RadialStop[]): boolean {
  const last = stops.at(-1) as RadialStop;
  if (last.transparent) {
    return true;
  }
  const lastAlpha = last.color === null ? 1 : (last.color.a ?? 1);
  return lastAlpha <= RADIAL_FADE_MAX_ALPHA;
}

export function checkRadialGlow(input: RadialGlowInput): Finding | null {
  if (input.sanctioned || input.width < RADIAL_MIN_WIDTH_PX || input.height < RADIAL_MIN_HEIGHT_PX) {
    return null;
  }
  const args = extractRadialStopArgs(input.value);
  if (args === null) {
    return null;
  }
  const stops = args.map(parseRadialStopToken);
  if (!fadesOut(stops)) {
    return null;
  }
  const colored = stops.filter((s): s is RadialStop & { color: Rgb } => !s.transparent && s.color !== null && (s.color.a ?? 1) > RADIAL_FADE_MAX_ALPHA);
  if (colored.length === 0 || colored.every((s) => rgbChroma(s.color) < SPOTLIGHT_MIN_CHROMA)) {
    return null; // nothing visible, or a neutral vignette — a legitimate lighting move
  }
  if (colored.some((s) => (s.color.a ?? 1) >= HALO_MIN_STOP_ALPHA)) {
    return {
      rule: "radial-halo",
      severity: "P2",
      selector: input.selector,
      value: `saturated radial wash on ${Math.round(input.width)}×${Math.round(input.height)}`,
      message:
        "a saturated chromatic radial wash used as a background glow — the generated-UI halo tell; ground the surface with a solid or subtly shifted background",
      origin: "impeccable",
    };
  }
  if (colored.length <= SPOTLIGHT_MAX_STOPS) {
    return {
      rule: "radial-spotlight-glow",
      severity: "P3",
      selector: input.selector,
      value: `low-alpha radial spotlight on ${Math.round(input.width)}×${Math.round(input.height)}`,
      message:
        "a translucent accent radial 'spotlight' behind a surface — sanctioned only on the owner effect carriers (empty-state aura, media-grid spotlight, weave glow); anywhere else it is the reflex decoration tell",
      origin: "impeccable",
    };
  }
  return null;
}

// ── Decorative background patterns (impeccable stripes / grid fields) ────────

export type BgPatternInput = {
  readonly selector: string;
  readonly kind: "stripe" | "grid";
  readonly backgroundSize: string;
  readonly width: number;
  readonly height: number;
};

const PATTERN_MIN_WIDTH_PX = 100;
const PATTERN_MIN_HEIGHT_PX = 40;

export function checkBgPattern(input: BgPatternInput): Finding | null {
  if (input.width < PATTERN_MIN_WIDTH_PX || input.height < PATTERN_MIN_HEIGHT_PX) {
    return null;
  }
  if (input.kind === "stripe") {
    return {
      rule: "stripe-background",
      severity: "P3",
      selector: input.selector,
      value: "repeating-linear-gradient surface decoration",
      message:
        "repeating-gradient stripes as surface decoration are a generated-UI signature — reach for a deliberate texture (the sanctioned grain axis) or leave the surface plain",
      origin: "impeccable",
    };
  }
  return {
    rule: "grid-line-background",
    severity: "P3",
    selector: input.selector,
    value: `two-axis gradient grid (cell ${input.backgroundSize})`,
    message: "a decorative grid-line background drawn with tiled hairline gradients — reserve grid overlays for actual canvas/map/measurement surfaces",
    origin: "impeccable",
  };
}

// ── Icon tile stacked above a heading (impeccable `icon-tile-stack`) ─────────

export type IconTileInput = {
  readonly headingTag: string;
  readonly headingText: string;
  readonly headingTop: number;
  readonly siblingSelector: string;
  readonly siblingWidth: number;
  readonly siblingHeight: number;
  readonly siblingBottom: number;
  readonly siblingBgAlpha: number;
  readonly siblingHasBgImage: boolean;
  readonly siblingBorderWidth: number;
  readonly siblingRadiusPx: number;
  readonly hasIconChild: boolean;
  readonly iconChildWidth: number;
};

const TILE_MIN_PX = 32;
const TILE_MAX_PX = 128;
const TILE_MIN_ASPECT = 0.7;
const TILE_MAX_ASPECT = 1.4;
const TILE_BG_MIN_ALPHA = 0.1;
const TILE_ICON_MAX_FILL = 0.95;
const TILE_STACK_SLACK_PX = 4;
const CIRCLE_RADIUS_FACTOR = 2; // radius ≥ width/2 = a circle = an avatar, not the tile template

function iconTileShapeMatches(input: IconTileInput): boolean {
  const w = input.siblingWidth;
  const h = input.siblingHeight;
  if (w < TILE_MIN_PX || w > TILE_MAX_PX || h < TILE_MIN_PX || h > TILE_MAX_PX) {
    return false;
  }
  const aspect = w / h;
  if (aspect < TILE_MIN_ASPECT || aspect > TILE_MAX_ASPECT) {
    return false;
  }
  const tileVisible = input.siblingBgAlpha > TILE_BG_MIN_ALPHA || input.siblingHasBgImage || input.siblingBorderWidth > 0;
  if (!tileVisible || input.siblingRadiusPx >= w / CIRCLE_RADIUS_FACTOR) {
    return false;
  }
  if (!input.hasIconChild || (input.iconChildWidth > 0 && input.iconChildWidth >= w * TILE_ICON_MAX_FILL)) {
    return false;
  }
  // Vertical stacking: the tile must end above where the heading starts.
  return !(input.headingTop > 0 && input.siblingBottom > 0 && input.siblingBottom > input.headingTop + TILE_STACK_SLACK_PX);
}

export function checkIconTile(input: IconTileInput): Finding | null {
  if (!iconTileShapeMatches(input)) {
    return null;
  }
  return {
    rule: "icon-tile-stack",
    severity: "P3",
    selector: input.siblingSelector,
    value: `${Math.round(input.siblingWidth)}×${Math.round(input.siblingHeight)}px icon tile above ${input.headingTag} "${input.headingText}"`,
    message:
      "a rounded-square icon container stacked above a heading is the universal generated feature-card template — put the icon beside the heading or let it sit in flow without its own container",
    origin: "impeccable",
  };
}

// ── Static motion offenders (impeccable `bounce-easing` / `layout-transition`) ──

export type MotionStaticInput = {
  readonly selector: string;
  readonly kind: "bounce-name" | "overshoot-bezier" | "layout-transition";
  readonly value: string;
  /** Inside an accordion/collapsible panel — motion law §3.7 sanctions measured-var height there. */
  readonly panelExempt: boolean;
};

export function checkMotionStatic(input: MotionStaticInput): Finding | null {
  if (input.kind === "layout-transition") {
    if (input.panelExempt) {
      return null;
    }
    return {
      rule: "layout-transition",
      severity: "P3",
      selector: input.selector,
      value: `transition: ${input.value}`,
      message:
        "a declared transition on a layout property (width/height/padding/margin) — per-frame layout when it runs; motion law §3.7 is compositor-only (transform/opacity), with only the measured-var accordion/collapsible panels exempt",
      origin: "impeccable",
    };
  }
  return {
    rule: "bounce-easing",
    severity: "P2",
    selector: input.selector,
    value: input.value,
    message:
      "bounce/elastic/overshoot easing on programmatic motion — banned by the motion law (§4.3: no spring-overshoot outside genuinely gesture-driven surfaces); use --ease-out-expo",
    origin: "impeccable",
  };
}

// ── Page censuses: fonts + type-scale spread (impeccable adapted, ramp-bound) ──

export type FontCensusInput = { readonly families: readonly string[]; readonly sizes: readonly number[] };

const FLAT_HIERARCHY_MIN_SIZES = 3;
const FLAT_HIERARCHY_MIN_RATIO = 2.0;

export function checkFontCensus(census: FontCensusInput): Finding[] {
  const findings: Finding[] = [];
  for (const family of census.families) {
    if (!RAMP_FONT_FACES.has(family)) {
      findings.push({
        rule: "off-theme-font",
        severity: "P2",
        selector: "page",
        value: family,
        message: `rendered font face "${family}" is outside the token stacks (font.sans/font.mono → ${[...RAMP_FONT_FACES].join(", ")}) — a stray face means a missing font-family token application`,
        origin: "impeccable",
      });
    }
  }
  if (census.sizes.length >= FLAT_HIERARCHY_MIN_SIZES) {
    const sorted = [...census.sizes].sort((a, b) => a - b);
    const min = sorted[0] as number;
    const max = sorted.at(-1) as number;
    if (min > 0 && max / min < FLAT_HIERARCHY_MIN_RATIO) {
      findings.push({
        rule: "flat-type-hierarchy",
        severity: "P3",
        selector: "page",
        value: `${sorted.map((s) => `${s}px`).join(", ")} (ratio ${(max / min).toFixed(1)}:1)`,
        message:
          "page font sizes are too close together for a visible hierarchy — use fewer steps with more contrast (the ramp spans micro 10.5 → display 24 for a reason)",
        origin: "impeccable",
      });
    }
  }
  return findings;
}

// ── Text overflow (impeccable `text-overflow` — the walker measured the spill) ──

export type TextOverflowInput = { readonly selector: string; readonly spillPx: number; readonly mode: "block" | "inline" };

export function checkTextOverflow(input: TextOverflowInput): Finding {
  return {
    rule: "text-overflow",
    severity: "P1",
    selector: input.selector,
    value: `${input.spillPx}px spill (${input.mode})`,
    message: `text overflows its ${input.mode === "block" ? "box" : "container"} by ${input.spillPx}px with no scroll affordance — wrap, truncate with a full-value affordance, or widen the container`,
    origin: "impeccable",
  };
}

// ── Repeated literal text in one container (impeccable `repeated-container-text`) ──

export type RepeatedTextInput = {
  readonly containerSelector: string;
  readonly text: string;
  readonly count: number;
  readonly distinctSigs: number;
};

export function checkRepeatedText(input: RepeatedTextInput): Finding {
  return {
    rule: "repeated-container-text",
    severity: "P3",
    selector: input.containerSelector,
    value: `"${input.text}" ×${input.count} in ${input.distinctSigs} distinct spots`,
    message:
      "the same literal text rendered 3+ times at structurally different positions inside one card — usually a status wired into every slot of a template; say it once where it matters",
    origin: "impeccable",
  };
}

// ── Clipping container vs positioned child (impeccable `clipped-overflow-container`) ──

export type ClippedOverflowInput = { readonly selector: string; readonly childSelector: string };

export function checkClippedOverflow(input: ClippedOverflowInput): Finding {
  return {
    rule: "clipped-overflow",
    severity: "P2",
    selector: input.selector,
    value: `clips ${input.childSelector}`,
    message:
      "an overflow-hidden/clip container is cutting a positioned child that needs to escape (tooltip/menu/badge) — portal it, use position:fixed, or let the overflow be visible (skill §3)",
    origin: "impeccable",
  };
}

// ── Cards flush against a scroller edge (impeccable `edge-flush-cards`) ───────

export type EdgeFlushInput = {
  readonly scrollerSelector: string;
  readonly cardSelector: string;
  readonly edge: "left" | "right";
  readonly gapPx: number;
  readonly count: number;
};

export function checkEdgeFlush(input: EdgeFlushInput): Finding {
  return {
    rule: "edge-flush-cards",
    severity: "P3",
    selector: input.scrollerSelector,
    value: `${input.count} card(s) flush ${input.edge} (${input.gapPx}px gap, e.g. ${input.cardSelector})`,
    message:
      "cards sit flush against one scroller edge at rest while keeping a gutter on the other — the panel is sized wider than its clip box; keep a consistent inset on both sides",
    origin: "impeccable",
  };
}

// ── Uncaught page errors (impeccable `script-error`; runner-side capture) ─────

const SCRIPT_ERROR_MAX = 3;
const SCRIPT_ERROR_MSG_MAX = 160;

export function checkScriptErrors(pageErrors: readonly string[]): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const raw of pageErrors) {
    const message = (raw.split("\n")[0] ?? "").trim().slice(0, SCRIPT_ERROR_MSG_MAX);
    if (message === "" || seen.has(message)) {
      continue;
    }
    seen.add(message);
    if (findings.length >= SCRIPT_ERROR_MAX) {
      break;
    }
    findings.push({
      rule: "script-error",
      severity: "P0",
      selector: "page",
      value: message,
      message:
        "a script threw an uncaught exception while the page loaded — broken JS silently kills interactions and can blank whole surfaces; fix this before judging anything else",
      origin: "impeccable",
    });
  }
  return findings;
}

// ── Duplicate action doors — the RUNTIME half of issue #252 ─────────────────────────────────────────
// "New chat lives in three places." The STATIC gate (`duplicate-action-doors`, scripts/check/gates) censuses
// tRPC call sites per rail section and is blind by construction to a REGISTRY-RENDERED action — one call site
// behind N rendered slots, which is precisely how the founding complaint escapes it (its three doors all
// call one shared state action). This lens is the other half: the same (role, accessible name) OFFERED more
// than once on one rendered plane. Neither arm subsumes the other — the static one catches one verb wearing
// N different labels, this one catches one label rendered N times from one verb.
//
// NOTHING IS HARDCODED. The key is the control's own computed name; no procedure or affordance is named here.
//
// THE FALSE-POSITIVE CLASS IS PER-DATUM REPETITION — twelve "Open" buttons in a chat list are twelve
// different chats, not twelve doors to one action — and the discriminator is STRUCTURAL PATH. Per-datum
// instances are rendered by ONE piece of code, so their paths from the root are IDENTICAL; genuinely
// separate homes (a hero CTA, a rail button, a topbar glyph) are reached by DIFFERENT paths. A twin-SIBLING
// count was tried first and refused with a receipt: keyed on tag+class it reads two bare wrapper divs as a
// list and swallowed every door on a three-door stage.

export type ActionDoorInput = {
  readonly selector: string;
  /** Explicit `role`, else the implicit role of the tag (`input:<type>` for inputs). */
  readonly role: string;
  /** The accessible name as a COMPARISON KEY: case-folded, whitespace-collapsed, trailing punctuation
   *  stripped. Never empty — an unnamed control is the `aria-name` rule's finding, not this one. */
  readonly name: string;
  /** The chain of tag@data-slot.classes signatures from this control up to `<body>`, POSITION-FREE.
   *  Two doors sharing a path are one component rendered per datum; two doors with different paths are two
   *  homes. */
  readonly path: string;
};

/** Above this the surface is a per-datum grid the structural test failed to recognise, not an IA defect —
 *  reporting it would be a false-positive factory rather than a finding. */
const DOOR_GROUP_MAX = 6;

export function checkDuplicateDoors(doors: readonly ActionDoorInput[]): Finding[] {
  const groups = new Map<string, ActionDoorInput[]>();
  for (const door of doors) {
    if (door.name.length === 0) {
      continue;
    }
    const key = `${door.role}|${door.name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(door);
    groups.set(key, bucket);
  }
  const findings: Finding[] = [];
  for (const [key, bucket] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // ONE DOOR PER DISTINCT PATH: the same path is one component rendered per datum, however many rows it
    // has. Distinct paths are distinct homes, which is the whole finding.
    const homes = new Map<string, ActionDoorInput>();
    for (const door of bucket) {
      if (!homes.has(door.path)) {
        homes.set(door.path, door);
      }
    }
    if (homes.size < 2 || homes.size > DOOR_GROUP_MAX) {
      continue;
    }
    const [role = "control", name = ""] = key.split("|");
    const at = [...homes.values()].map((d) => d.selector);
    findings.push({
      rule: "duplicate-action-door",
      severity: "P3",
      selector: at[0] ?? "page",
      value: `${homes.size}x ${role} "${name}"`,
      message: `the same action is offered from ${homes.size} structurally distinct places on one plane — a ${role} named "${name}" at ${at.join(
        " AND ",
      )}. One verb wants one home per plane (the more-than-one-home IA class, docs/architecture/core/client-architecture-lockdown.md §13); if a second door is ruled UX, the ruling is what makes it one`,
      origin: "orbweaver",
    });
  }
  return findings;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export type RawSamples = {
  readonly texts: readonly ContrastInput[];
  readonly images: readonly ImageDistortionInput[];
  readonly tapTargets: readonly TapTargetInput[];
  readonly accessibleNames: readonly AccessibleNameInput[];
  /** Named, offered, non-per-datum controls — the runtime dual-home lens (#252). Optional: absent from the
   *  fixture sample sets that predate it, where it reads as "no doors censused". */
  readonly actionDoors?: readonly ActionDoorInput[];
  readonly mainLandmarkPresent: boolean;
  readonly tabIndexes: readonly TabIndexInput[];
  readonly zIndexes: readonly ZIndexInput[];
  readonly nestedCards: readonly NestedCardInput[];
  readonly gradientTexts: readonly GradientTextInput[];
  readonly animatedImgHovers: readonly AnimatedImgHoverInput[];
  /** Whether the page was measured under `(pointer: coarse)` — selects the tap-target floor. */
  readonly pointerCoarse: boolean;
  readonly textStyles: readonly TextStyleInput[];
  readonly accentBorders: readonly AccentBorderInput[];
  readonly shadowGlows: readonly GlowShadowInput[];
  readonly radialGlows: readonly RadialGlowInput[];
  readonly bgPatterns: readonly BgPatternInput[];
  readonly iconTiles: readonly IconTileInput[];
  readonly motionStatics: readonly MotionStaticInput[];
  readonly fontCensus: FontCensusInput;
  readonly brokenImages: readonly BrokenImageInput[];
  readonly headings: readonly HeadingSample[];
  readonly overflows: readonly TextOverflowInput[];
  readonly repeatedTexts: readonly RepeatedTextInput[];
  readonly clippedOverflows: readonly ClippedOverflowInput[];
  readonly edgeFlushCards: readonly EdgeFlushInput[];
};

/** Runs one nullable check over one sample array, pushing every non-null Finding. */
function pushFindings<T>(findings: Finding[], items: readonly T[], check: (item: T) => Finding | null): void {
  for (const item of items) {
    const f = check(item);
    if (f !== null) {
      findings.push(f);
    }
  }
}

/** Runs one array-returning check over one sample array. */
function pushAllFindings<T>(findings: Finding[], items: readonly T[], check: (item: T) => Finding[]): void {
  for (const item of items) {
    findings.push(...check(item));
  }
}

/** Runs every check over a raw-sample bundle — the one place that fans a page's facts out to findings. */
export function collectFindings(samples: RawSamples): Finding[] {
  const findings: Finding[] = [];
  pushFindings(findings, samples.texts, checkContrast);
  pushFindings(findings, samples.texts, checkGrayOnColor);
  pushFindings(findings, samples.images, checkImageDistortion);
  pushFindings(findings, samples.tapTargets, (t) => checkTapTarget(t, samples.pointerCoarse));
  pushFindings(findings, samples.accessibleNames, checkAccessibleName);
  findings.push(...checkDuplicateDoors(samples.actionDoors ?? []));
  const landmark = checkMainLandmark({ main: samples.mainLandmarkPresent });
  if (landmark !== null) {
    findings.push(landmark);
  }
  pushFindings(findings, samples.tabIndexes, checkTabIndexSmell);
  pushFindings(findings, samples.zIndexes, checkZIndex);
  pushFindings(findings, samples.nestedCards, checkNestedCard);
  pushFindings(findings, samples.gradientTexts, checkGradientText);
  pushFindings(findings, samples.animatedImgHovers, checkAnimatedImgHover);
  pushAllFindings(findings, samples.textStyles, checkTextStyle);
  pushAllFindings(findings, samples.accentBorders, checkAccentBorder);
  pushFindings(findings, samples.shadowGlows, checkGlowShadow);
  pushFindings(findings, samples.radialGlows, checkRadialGlow);
  pushFindings(findings, samples.bgPatterns, checkBgPattern);
  pushFindings(findings, samples.iconTiles, checkIconTile);
  pushFindings(findings, samples.motionStatics, checkMotionStatic);
  findings.push(...checkFontCensus(samples.fontCensus));
  findings.push(...samples.brokenImages.map(checkBrokenImage));
  findings.push(...checkHeadingOrder(samples.headings));
  findings.push(...samples.overflows.map(checkTextOverflow));
  findings.push(...samples.repeatedTexts.map(checkRepeatedText));
  findings.push(...samples.clippedOverflows.map(checkClippedOverflow));
  findings.push(...samples.edgeFlushCards.map(checkEdgeFlush));
  return findings;
}
