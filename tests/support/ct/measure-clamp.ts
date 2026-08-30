// THE CLAMP ORACLE (#847) — "does this clipped run end on a LINE BOUNDARY, or is a line painted half?"
//
// Two obvious oracles are both wrong, and each was tried on the way here:
//
//   `el.scrollHeight > el.clientHeight` is the standard "is this text truncated?" probe, so a CORRECTLY
//   clamped run reports true. It answers a different question entirely.
//
//   `Range.getClientRects()` returns one rect per line — but those are the FONT boxes, which under a tight
//   `line-height` are TALLER than the line boxes they sit in. Measured on a `text-micro leading-tight`
//   gloss: line-height 13.125px against 14px font boxes, so line 1's own rect overhangs the clip box by
//   ~1px at BOTH ends and every run reads as "sliced" no matter how it is clipped.
//
// So measure the LINE GRID. The clip box (`clientHeight`, the padding box under `overflow: hidden`) exposes
// `clientHeight / line-height` line boxes; the whole ones are what a reader reads and the REMAINDER is
// exactly the horizontally-sliced line. The remainder only counts when there is hidden content to paint
// into it — a short run in a slightly-too-tall box has an empty remainder, which is not this defect.
//
// Measured at the injections-manager site: 11.9px of remainder before the fix (a `pb-block` sitting INSIDE
// the clamped element's own overflow box), 0px after it.

import type { Locator } from "@playwright/test";

export interface ClampMeasurement {
  /** Whole line boxes the clip box exposes — what the reader actually reads. */
  readonly visibleLines: number;
  /** The leftover strip below them, in px: a line painted half. Zero is the only correct value. */
  readonly partialLinePx: number;
  /** Carried for the failure diff — `display` decides whether a clamp engages at all. */
  readonly display: string;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly lineHeight: number;
}

/** Measure `locator`'s clip box against its own line grid. The element must be visible. */
export async function measureClamp(locator: Locator): Promise<ClampMeasurement> {
  return await locator.evaluate((el: HTMLElement): ClampMeasurement => {
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
    // Sub-pixel tolerance, in LINES: `clientHeight` is an integer, so an exact N-line box reads N ± ~0.01.
    const tolerance = 0.05;
    const visibleLines = Math.floor(el.clientHeight / lineHeight + tolerance);
    const hasHiddenContent = el.scrollHeight > el.clientHeight;
    const remainder = el.clientHeight - visibleLines * lineHeight;
    return {
      visibleLines,
      partialLinePx: hasHiddenContent ? Math.round(Math.max(0, remainder)) : 0,
      display: getComputedStyle(el).display,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      lineHeight,
    };
  });
}
