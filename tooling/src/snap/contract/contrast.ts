// The raw facts `--contrast`'s in-page script returns, before any verdict is formed. Split out of
// ops/contrast.ts when the #466 exemption pushed that file past the tooling size cap; shapes live in
// contract/ by the five-slot template (docs/architecture/core/Core-Tooling-Law.md §2.5).

import type { Rgb } from "../../_shared/wcag.ts";
import type { ContrastOutcome } from "./types.ts";

/** Every match is outside the viewport (#211): measuring one would be a verdict on pixels nobody saw. */
export interface ContrastOffscreen {
  offscreen: true;
  total: number;
}

/** Matches that ARE in the viewport but every one of them is painted over by something else (#211) — a
 *  third distinct outcome, because measuring one samples the OCCLUDER's pixels, and "I can only see the
 *  topbar there" is not "it fails contrast" either. */
export interface ContrastOccluded {
  occluded: true;
  total: number;
  inViewport: number;
  occluder: string | null;
}

export interface ContrastMeasured {
  color: string;
  fontSizePx: number;
  fontWeight: number;
  // "flat" = a trustworthy opaque ancestor bg (css-resolve path); "transparent"/"indeterminate" = the
  // ancestor walk couldn't see the real backdrop (a fixed sibling layer / a background-image) — Node
  // pixel-samples the composite instead of trusting a fabricated baseline.
  backdrop: { kind: "flat"; color: string } | { kind: "transparent" } | { kind: "indeterminate" };
  hasText: boolean;
  /** Does the subject paint INK OF ITS OWN that `color` describes (#1111)? An `<svg>` in the subtree draws
   *  with `currentColor`, so `getComputedStyle().color` is its real paint and the ink arm stays honest for
   *  an icon-only control. Everything else with no text paints only its own box, and reading `color` there
   *  measures an INHERITED value the eye never sees — that subject goes to the FILL arm. */
  hasIconInk: boolean;
  inactive: boolean;
  role: string;
  tag: string;
  /** Product of `opacity` over the element + ancestors — `<1` means the foreground is painted dimmed and
   *  must be composited at this alpha over the backdrop before measuring. */
  foregroundOpacity: number;
  box: { x: number; y: number; width: number; height: number };
  /** The four corner radii in CSS px (#1111). The FILL arm needs the SHAPE, not the box: a background is
   *  clipped to the rounded border box, so a pill's box corners show what is painted BEHIND it — counting
   *  those as one of the subject's own channels read the switch thumb at 7.44:1 on the ember accent it
   *  does not paint. Percentages are resolved in-page against the box. */
  radii: { tl: number; tr: number; br: number; bl: number };
  /** Which querySelectorAll index actually got measured, and how many matched — a non-zero index means
   *  earlier matches were skipped as off-viewport OR as occluded, which the report states so nobody
   *  assumes "the first one". */
  matchIndex: number;
  total: number;
}

export type ContrastFacts = ContrastMeasured | ContrastOffscreen | ContrastOccluded | null;

/** A decoded framebuffer clip: raw RGB(A) bytes plus the geometry needed to index them. */
export interface ContrastPixelImage {
  readonly data: Buffer | Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

/** A rectangle in IMAGE pixels (device pixels — the caller has already applied the device-pixel ratio). */
export interface ContrastFillRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Where the subject's painted SHAPE sits inside a decoded clip, in image pixels: its box, its corner
 *  radii, and the feather of blended edge that belongs to neither the fill nor the surround. */
export interface ContrastFillGeometry {
  readonly interior: ContrastFillRegion;
  readonly radii: ContrastMeasured["radii"];
  readonly feather: number;
}

/** The loudest painted channel of a FILL-ONLY subject, measured against the band outside its box (#1111).
 *  `channel` names WHICH population carried it: `fill` = the colour most of the box is, `inset-edge` = a
 *  minority population (an inset ring, a border, a focus outline) that beats the fill — the distinction a
 *  reviewer needs, because a 3:1 carried by 4% of the box is a hairline affordance, not a filled state. */
interface ContrastFillSample {
  readonly ratio: number;
  readonly fill: Rgb;
  readonly surround: Rgb;
  readonly channel: "fill" | "inset-edge";
  /** The winning population's share of the interior, 0..1. */
  readonly share: number;
  /** The dominant surround's share of the band, 0..1 — printed because a subject flush with its parent's
   *  edge borders two surfaces, and a reviewer has to see WHICH one carried the verdict. */
  readonly surroundShare: number;
  readonly interiorPixels: number;
  readonly bandPixels: number;
}

/** No channel could be measured. NEVER a ratio: the whole defect this arm closes is a fill-polarity claim
 *  answered with a coincidental number, so "I could not measure" has to be its own printed outcome. */
interface ContrastFillRefusal {
  readonly refusal: string;
}

export type ContrastFillReading = ContrastFillSample | ContrastFillRefusal;

export interface ContrastBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Lossless contrast evidence for matrix consumers. The ordinary CLI still prints `ContrastOutcome`;
 * this record prevents a matrix from mistaking a refusal, an offscreen match, or a CSS-only value for
 * a sampled framebuffer verdict. */
export interface ContrastEvidence {
  readonly selector: string;
  readonly status: "instrument-error" | "ok" | "refused";
  readonly candidates: number;
  readonly inViewport: number;
  readonly sampled: number;
  readonly matchIndex: number | null;
  /** `fill-sample` (#1111) is a framebuffer verdict like `pixel-sample`, but on a FILL-ONLY subject: the
   *  `foreground` is the loudest painted channel of the element's own box and `backdrop` is the band
   *  outside it — never an ink colour the subject does not paint. */
  readonly method: "css-resolve" | "fill-sample" | "pixel-sample" | null;
  /** The fill arm's channel receipt (#1111) — `null` on every ink-arm and refused row. */
  readonly fillChannel: { readonly kind: ContrastFillSample["channel"]; readonly share: number } | null;
  readonly ratio: number | null;
  readonly requiredRatio: number | null;
  readonly passed: boolean | null;
  readonly foreground: Rgb | null;
  readonly backdrop: Rgb | null;
  readonly reason: string | null;
}

export interface ContrastCapture {
  readonly outcome: ContrastOutcome;
  readonly evidence: ContrastEvidence;
}
