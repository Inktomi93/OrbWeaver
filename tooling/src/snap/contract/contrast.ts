// The raw facts `--contrast`'s in-page script returns, before any verdict is formed. Split out of
// ops/contrast.ts when the #466 exemption pushed that file past the tooling size cap; shapes live in
// contract/ by the five-slot template (docs/architecture/core/Core-Tooling-Law.md §2.5).

import type { Rgb } from "../../_shared/wcag.ts";

/** One printed CONTRAST/CONTRAST-EDGE line and whether it reddens the run. Homed HERE, not in types.ts,
 *  since #1346: the capture sheet in types.ts carries the structured reading beside these lines, and two
 *  files cannot import each other (dep-cruiser `no-circular`). */
export interface ContrastOutcome {
  line: string;
  failed: boolean;
}

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
  /** Is `color` the ::placeholder colour of an EMPTY field that actually carries a placeholder string
   *  (#2429 item 2)? That ink is real rendered text — the only text an empty composer paints — so the
   *  subject belongs to the INK arm at the TEXT threshold, not to the fill arm. The in-page script has
   *  always resolved the pseudo-element's colour here; before this flag existed nothing downstream knew
   *  it had, and `isFillSubject` (no textContent, no <svg>) sent the reading to the fill arm instead. */
  placeholderInk: boolean;
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
  readonly kind: "measured";
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
 *  answered with a coincidental number, so "I could not measure" has to be its own printed outcome.
 *
 *  IT IS DISCRIMINATED, not told apart by key presence. Two readers depend on that: a malformed value can
 *  no longer fall through to the measured arm (the #1004 fix one contract over), and a `catch` returning
 *  this is a failure-DISCRIMINATED outcome the `caught-failure-ownership` census recognises as ownership —
 *  a bare `{ refusal }` reads to it as success data with an error sitting beside it. */
interface ContrastFillRefusal {
  readonly kind: "refused";
  readonly refusal: string;
}

/** The capture MACHINERY failed — `page.screenshot()` threw (twice: ops/contrast-fill.ts retries once on
 *  the same page before minting this) or the buffer would not decode. An INSTRUMENT fault, discriminated
 *  separately from `ContrastFillRefusal` (#1758): a `Page.captureScreenshot` protocol error under
 *  contention is a DIFFERENT class from "I measured and there is nothing to see" — folding the two into
 *  one `refused` reason string made a reason-string pin red on a transient CDP message that has nothing
 *  to do with the fixture. The caller prints `status: "instrument-error"`, the same class
 *  ops/contrast-pixels.ts's backdrop screenshot failure already uses. */
interface ContrastFillCaptureFailed {
  readonly kind: "capture-failed";
  readonly reason: string;
}

export type ContrastFillReading = ContrastFillSample | ContrastFillRefusal | ContrastFillCaptureFailed;

// ── THE EDGE ARM (#1346) ──────────────────────────────────────────────────────────────────────────────
// WCAG 1.4.11 is a question about a BOUNDARY: the visual affordance that says "this is a field" must clear
// 3:1 against what it sits on. Neither existing arm answers it. The ink arm measures the subject's `color`
// (its text), the fill arm measures the loudest channel of its INTERIOR against the band outside — and on
// a bordered input the interior is the same surface as the surround, so the fill arm printed
// `NO VERDICT (fill-only, undecodable) — … measure the specific edge`, naming a remedy that had no flag
// behind it (measured 2026-09-04 on `[aria-label="Search chats"]`). The reviewer hand-rolled luminance in
// `--eval` and got garbage. This is the flag that remedy names.

/** One side's border, as the page reports it. `widthPx` is 0 when that side paints no border at all. */
interface ContrastEdgeBorder {
  readonly widthPx: number;
  readonly color: string;
  readonly style: string;
}

export const CONTRAST_EDGE_SIDES = ["top", "right", "bottom", "left"] as const;
export type ContrastEdgeSide = (typeof CONTRAST_EDGE_SIDES)[number];

/** The in-page facts the edge arm measures from: the border box, its four borders, its radii, and which
 *  match was chosen. Deliberately NOT `ContrastMeasured` — the edge question needs the borders, and the
 *  ink arm's font/role/opacity facts say nothing about a boundary. */
export interface ContrastEdgeFacts {
  readonly box: ContrastBox;
  readonly borders: Readonly<Record<ContrastEdgeSide, ContrastEdgeBorder>>;
  readonly radii: ContrastMeasured["radii"];
  readonly matchIndex: number;
  readonly total: number;
}

/** One side's verdict. `skipped` is a side with no border to judge — not a pass and not a failure: WCAG
 *  1.4.11 has nothing to say about a boundary the page does not paint. */
export type ContrastEdgeSideReading =
  | {
      readonly side: ContrastEdgeSide;
      readonly kind: "measured";
      readonly ratio: number;
      readonly ink: Rgb;
      readonly neighbour: Rgb;
      readonly inkShare: number;
      readonly neighbourShare: number;
      readonly inkPixels: number;
      readonly neighbourPixels: number;
    }
  | { readonly side: ContrastEdgeSide; readonly kind: "skipped"; readonly reason: string }
  | { readonly side: ContrastEdgeSide; readonly kind: "refused"; readonly reason: string };

/** The whole subject's reading: one row per side, plus the refusal that applies to all of them. `refused`
 *  is a DOMAIN no-verdict (an empty/off-screen box); `capture-failed` is the SAME instrument-fault class
 *  `ContrastFillCaptureFailed` names (#1758) — `page.screenshot()`/the pixel decode failed twice, never a
 *  claim about the border itself. Kept as a separate arm from `refused` so a reason-string pin cannot red
 *  on a transient CDP message. */
export type ContrastEdgeReading =
  | { readonly kind: "measured"; readonly sides: readonly ContrastEdgeSideReading[] }
  | { readonly kind: "refused"; readonly refusal: string }
  | { readonly kind: "capture-failed"; readonly reason: string };

/** Where the subject's BORDER BOX sits inside a decoded clip, in image pixels, with each side's border
 *  thickness — the edge arm's twin of `ContrastFillGeometry`. */
export interface ContrastEdgeGeometry {
  readonly interior: ContrastFillRegion;
  readonly radii: ContrastMeasured["radii"];
  readonly feather: number;
  /** Border thickness per side, in IMAGE pixels (0 = no border painted there). */
  readonly borders: Readonly<Record<ContrastEdgeSide, number>>;
  /** How far OUTSIDE the box the neighbour band reaches, in image pixels. */
  readonly pad: number;
}

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
  /** `edge-sample` (#1346) is the WCAG 1.4.11 boundary read: `foreground` is the modal colour of the
   *  border strip on the WORST side and `backdrop` is the surface immediately outside that side. */
  readonly method: "css-resolve" | "edge-sample" | "fill-sample" | "pixel-sample" | null;
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
