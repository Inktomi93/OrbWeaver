// Contrast + text-over-art + gray-on-color — WCAG 2.x math over resolved backdrops. Pure; every
// threshold cited. Provenance/attribution: lib/collect.ts header.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import { contrastRatio, isLargeText, LARGE_MIN_RATIO, MEASURABLE_OPACITY_MIN, NORMAL_MIN_RATIO, relativeLuminance, rgbChroma } from "@orb/tooling/_shared/wcag";
import type { Finding } from "../contract/findings.ts";
import type { ContrastInput } from "../contract/samples.ts";
import { OPAQUE_STOP_MIN_ALPHA } from "./ramp.ts";

/** Below this accumulated opacity the foreground is composited before measuring. Just under 1 so
 *  sub-pixel float noise (0.999…) never triggers a pointless composite. Same constant, same reason, as
 *  snap.ts's FOREGROUND_OPACITY_EPS — the two instruments must not disagree about what "dimmed" is. */
const FOREGROUND_OPACITY_EPS = 0.999;

/** Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of a
 *  glyph painted inside an `opacity<1` group. opacity 1 is a no-op; opacity 0 is the pure backdrop. */
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
  // NO VERDICT below the measurable-opacity floor (#466): at that alpha the composite is the backdrop
  // whatever the authored color is, so the ratio is arithmetic, not evidence. Measured live: a home run
  // caught mid boot-animation filed two P1s reading `1.00:1 · dimmed α0.00` against the weave veil and
  // the brand wordmark — text that paints nothing at that instant. `isVisible` already drops EXACTLY
  // zero; this closes the mid-fade window it cannot see.
  if (opacity < MEASURABLE_OPACITY_MIN) {
    return null;
  }
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
