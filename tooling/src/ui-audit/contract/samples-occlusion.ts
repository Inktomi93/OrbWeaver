// ui-audit sample shapes — the PLACEMENT-COLLISION family: `headline-overhang` and
// `inline-padding-leak`, the two arms of impeccable's `text-occlusion` that were deferred when arm (i)
// landed as our own `obscured-target` (#816). Split from samples.ts because that file sits at the
// tooling-size boundary and is contested by concurrent lanes; the walker segment is
// ops/walker/census-occlusion.ts and the verdicts are lib/checks-quality.ts.
//
// PAINTED, NOT LAID OUT. Every geometry field here is measured from a rect already intersected against
// every clipping-or-scrolling ancestor's padding box, because `getBoundingClientRect` reports where a
// box WOULD be if nothing clipped it. A subject whose painted rect collapsed is never a sample — it is
// a `clipped-away` WITHHOLDING in the census, which is a no-verdict, not a clean result.

/** A display-scale line whose bulk sits OUTSIDE a bounded opaque card while its edge clips in.
 *
 *  The text usually still paints on top and stays readable, so this is not a legibility finding — it is
 *  the tell that two layers were dropped on the same pixels by accident. The walker has already proven
 *  the headline's centre is outside the card's x-range (a line whose centre is inside is `excluded`, not
 *  silently passed) and that the overlap is at most half the line's own width. */
export interface HeadlineOverhangInput {
  readonly selector: string;
  /** Stable authored-decision identity — repeats of one authored line collapse to a single population. */
  readonly authoredTarget?: string;
  /** Position-free structural home, paired with `authoredTarget`. */
  readonly authoredHome?: string;
  readonly cardSelector: string;
  readonly fontSizePx: number;
  /** Horizontal intersection of the two PAINTED rects. */
  readonly overlapPx: number;
  /** The headline's own painted width — `overlapPx` is judged as a fraction of it. */
  readonly widthPx: number;
  readonly text: string;
}

/** An `inline` element whose opaque fill overflows its own line box.
 *
 *  Inline padding reserves NO vertical space, so a `display: inline` slot carrying block-scale vertical
 *  padding paints a filled box that runs off its line onto the content above and below. In our closed
 *  world this is a VARIANT MISAPPLICATION — a `tv()` slot handed padding authored for a block — which is
 *  why the sample carries the padding it found alongside the geometry: the fix is at the variant, not at
 *  the neighbour that got painted over. */
export interface InlinePaddingLeakInput {
  readonly selector: string;
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  /** Height of the TALLEST surviving LINE FRAGMENT (`getClientRects()`), never the bounding rect: a
   *  wrapping inline's bounding rect is as tall as the whole run and clears any line-height multiple on
   *  wrapping alone, which is how a naive version of this rule flags every padded inline highlight. */
  readonly paintedHeightPx: number;
  readonly lineHeightPx: number;
  /** `padding-top` + `padding-bottom` — the authored value that did not reserve any space. */
  readonly paddingPx: number;
  /** A text-bearing sibling the fill is painting over, or `""` when the leak lands on bare text nodes or
   *  on nothing this walk can name. Evidence, never a gate — the leak is a defect with or without it. */
  readonly ontoSelector: string;
  readonly text: string;
}
