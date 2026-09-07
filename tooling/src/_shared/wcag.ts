// The WCAG 2.x contrast kernel — the fleet-shared ruler (snap --contrast, design-audit, the ui
// palette suites): sRGB relative luminance, the contrast ratio, and the large-text carve-out. One
// engine, every instrument → identical verdicts.
// ── Contrast (WCAG) ──────────────────────────────────────────────────────────

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

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

/** The effective (accumulated) foreground opacity below which a contrast ratio stops being EVIDENCE
 *  (#466). Compositing a glyph at α over its backdrop moves each channel by α·(fg−bg), so under 0.05
 *  the painted color is within ~13/255 of the backdrop WHATEVER the authored color is — the ratio
 *  collapses toward 1.00:1 by arithmetic, not by anything the surface did wrong. Measured live: a
 *  design-audit home run mid boot-animation filed two P1 contrasts reading `1.00:1 · dimmed α0.00`
 *  against the weave veil and the brand wordmark, which paint nothing at that instant. A verdict that
 *  can only come out one way is not a measurement, so both instruments REFUSE below this floor and say
 *  so, rather than emitting a finding the reviewer has to learn to ignore.
 *
 *  Deliberately far below the dimming the contrast rules DO judge: α0.5-0.6 text (issue #188) still
 *  gets composited and still fails, because at that alpha a different authored color genuinely could
 *  have passed. */
export const MEASURABLE_OPACITY_MIN = 0.05;

/** The accumulated opacity below which a foreground is COMPOSITED before it is measured. Just under 1 so
 *  sub-pixel float noise (0.999…) never triggers a pointless composite. */
export const FOREGROUND_OPACITY_EPS = 0.999;

/** Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of a
 *  glyph painted inside an `opacity<1` group. opacity 1 is a no-op; opacity 0 is the pure backdrop.
 *
 *  ONE HOME, FOR THE REASON THIS FILE EXISTS (lifted 2026-08-30). This function and the epsilon above were
 *  spelled TWICE — `snap/lib/contrast-verdict.ts` and `ui-audit/lib/checks-color.ts` — byte-identically,
 *  with the ui-audit copy carrying a comment asking the two not to drift ("the two instruments must not
 *  disagree about what dimmed is"). A comment is not an enforcer. They now share the declaration, beside
 *  the kernel they already both import, and a third consumer (the CT-browser sampler
 *  `tests/support/browser/pixel-contrast.ts`) takes it from here rather than minting a fourth. */
export function compositeForeground(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  const mix = (f: number, b: number): number => Math.round(opacity * f + (1 - opacity) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

// ── Inactive controls (WCAG 1.4.3 / 1.4.11 exemption) ────────────────────────
// THE ONE CLASSIFIER, shared by every instrument that samples the page. It lives here because two homes
// for one rule is exactly how snap and design-audit drifted (#624): snap skipped a disabled control out
// loud ("SKIPPED inactive control (WCAG contrast exemption)") while design-audit, which had NO classifier
// at all, filed the SAME element as a P1 at 2.64:1. Every disabled control in the app was a standing false
// positive, which trains a reader to discount the instrument's P1s wholesale.

/** WCAG 1.4.11's non-text boundary, applied to a control that renders NO text (an icon button, a graphical
 *  control) so a 4.5:1 TEXT ratio is not false-flagged against it. Numerically 3:1 like large-text, but a
 *  distinct concept — hence its own name. Also the floor below which an INACTIVE control stops being
 *  perceivable as a control at all (see `INACTIVE_ADVISORY_MAX_RATIO`). */
export const UI_COMPONENT_MIN_RATIO = 3;

/** How a control is inactive. The three spellings are NOT interchangeable, and the distinction is the
 *  whole reason this is a union rather than a boolean:
 *  - `native`  — `:disabled`. Genuinely inoperable: not focusable, not clickable. The clean 1.4.3 exemption.
 *  - `inert`   — inside `[inert]`. Same: the subtree is removed from interaction and the a11y tree.
 *  - `aria`    — `[aria-disabled="true"]`. Declared inactive but STILL FOCUSABLE and STILL ANNOUNCED, so a
 *                keyboard user can land on it and hear it. WCAG's exemption is written for an "inactive
 *                user interface component", which it is by declaration — but it remains PERCEIVABLE, so it
 *                is the one kind that keeps earning a usability advisory. */
export const INACTIVE_KINDS = ["none", "native", "aria", "inert"] as const;
export type InactiveKind = (typeof INACTIVE_KINDS)[number];

/** The classifier as an in-page JS EXPRESSION over a bound `el`. Both instruments build their sampling
 *  script as a STRING, so a shared string constant is the only shape that can actually be one home —
 *  a shared FUNCTION could not cross into the page. It stays an EXPRESSION (an IIFE) because all three
 *  call sites splice it into an assignment: `var inactiveKind = <this>;`. ES5-shaped for the same reason
 *  the walker is (see ops/walker.ts): `var`, function expressions, no arrows.
 *
 *  Precedence is unchanged and applies at every arm: `inert` wins over everything, native `:disabled`
 *  outranks the aria declaration.
 *
 *  TWO WAYS A CONTROL'S INACTIVENESS REACHES TEXT, and both are the SPEC's, not a convenience:
 *
 *  1. ANCESTRY (#1005, was `el.matches(…)`). A real control's text is a CHILD element — a disabled
 *     button's inner label span (`<button disabled><span>Pick one</span></button>`), a disabled Select's
 *     placeholder span — and that span
 *     matches neither `:disabled` nor `[aria-disabled="true"]`. Both instruments sample the TEXT-BEARING
 *     element, so the element-scoped spelling classified every such label "none" and judged it against the
 *     4.5:1 AA floor WCAG 1.4.3 exempts. `closest` matches the element ITSELF first, so the old behavior
 *     is a strict subset.
 *
 *  2. THE NAMING RELATION (#1016). WCAG 1.4.3's exception is "text … that is part of an inactive user
 *     interface component". A control's own accessible NAME is part of that component even when the DOM
 *     puts it outside the control's subtree — which is the normal shape: Base UI's `Slider.Label` renders
 *     a plain `<div>` the thumb points at with `aria-labelledby` (SliderLabel.js — `useLabel` without
 *     `native`), and a `<label for>` names its control from a sibling position. Measured 2026-09-01: a
 *     DISABLED slider's label read 3.19:1 under light (the house `data-disabled:opacity-50` group dim,
 *     `packages/ui/src/lib/disabled-state.ts`) and both instruments filed it as an AA contrast P1 — the
 *     instrument being WRONG about the spec, not conservative. So the kind also derives from a control
 *     that NAMES this element: the reverse `[aria-labelledby~="<id>"]` lookup (token-list `~=`, because
 *     one control can name several ids) and the native label association `el.closest("label").control`.
 *
 *  THE EXEMPTION IS FROM THE AA MINIMUM ONLY. An exempted name still rides the
 *  `INACTIVE_ADVISORY_MAX_RATIO` floor exactly like the control itself, so a disabled name dimmed below
 *  3:1 still surfaces as the `inactive-control-legibility` advisory — "is it even there?" is the one
 *  question the exemption must never swallow.
 *
 *  THE NATIVE ARM READS THE VENDOR SPELLING TOO (`[data-disabled]`), and that is not a widening — it is
 *  the mechanism-match this codebase's own laws already state. A Base UI COMPOSITE root is a `<div>`: it
 *  structurally cannot match `:disabled`, so the pseudo alone is blind to every disabled Slider, Select,
 *  Toggle and Switch in the app (`tooling/src/ui-audit/RULE-AUTHORING.md` row 3 is this exact class —
 *  "Base UI never sets the CSS pseudo for its own state, it sets a JS-driven `data-*`"), while
 *  `ops/walker/state-paint.ts`'s classified vocabulary already declares the conclusion in writing:
 *  `data-disabled` is OUT of the interaction-paint set precisely because it is "WCAG 1.4.3
 *  inactive-exempt, judged at rest on genuinely disabled controls". It maps to `native` because Base UI
 *  stamps it from the same `disabled` that puts `:disabled` on the component's own hidden input. The
 *  neighbouring `data-trigger-disabled` is a DIFFERENT attribute name and is not matched.
 *
 *  DELIBERATELY NARROW, both ways. A `closest("label")` fallback for a NON-labelable element is not the
 *  native arm (HTML declares no association there); the reverse lookup keys on THIS element's own id, so
 *  text merely ADJACENT to a disabled control, and a `labelledby` pointing at an id nothing carries, are
 *  both still judged. For a rule whose claim is "this text fails contrast", a false clean is the
 *  expensive direction — every arm above is proven two-sided in
 *  tests/tooling/ui-audit/ops/walker/census-text.int.test.ts. */
export const INACTIVE_KIND_EXPR = `(function () {
  var orbKindOf = function (node) {
    return node.closest("[inert]") ? "inert" : node.closest(":disabled,[data-disabled]") ? "native" : node.closest('[aria-disabled="true"]') ? "aria" : "none";
  };
  var orbOwn = orbKindOf(el);
  if (orbOwn !== "none") return orbOwn;
  var orbNamer = null;
  var orbId = el.getAttribute("id") || "";
  if (orbId !== "" && orbId.indexOf('"') === -1 && orbId.indexOf("\\\\") === -1) {
    orbNamer = document.querySelector('[aria-labelledby~="' + orbId + '"]');
  }
  if (orbNamer === null) {
    var orbLabel = el.closest("label");
    orbNamer = orbLabel && orbLabel.control ? orbLabel.control : null;
  }
  return orbNamer === null ? "none" : orbKindOf(orbNamer);
})()`;

/** Is this control exempt from a WCAG CONTRAST verdict? All three inactive spellings are — 1.4.3 exempts
 *  "inactive user interface components", and their dimming is the deliberate signal that they are off.
 *  This is snap's shipping behavior, preserved exactly; design-audit now agrees instead of contradicting it. */
export function isContrastExempt(kind: InactiveKind): boolean {
  return kind !== "none";
}

/** Does this control remain reachable and announced despite being declared inactive? Only `aria` — which
 *  is why `aria-disabled` is not identical to `disabled` for exemption purposes: a keyboard user can still
 *  focus it and a screen reader still reads it, so its legibility is a live usability question even though
 *  the WCAG contrast MINIMUM does not apply. */
export function remainsOperable(kind: InactiveKind): boolean {
  return kind === "aria";
}

/** Below this ratio an inactive control has stopped reading as a CONTROL at all — the "is it even there?"
 *  case the exemption must not swallow. Cited, not invented: it is WCAG 1.4.11's own UI-component boundary,
 *  used here as an advisory floor rather than as a pass/fail criterion.
 *  Deliberately the SAME numeric value as `UI_COMPONENT_MIN_RATIO`, kept under its own name because it
 *  is a distinct concept (an advisory floor, not a pass/fail minimum), not an accidental duplicate. */
export const INACTIVE_ADVISORY_MAX_RATIO = 3;
