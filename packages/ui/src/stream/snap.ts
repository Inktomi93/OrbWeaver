// Pure string-math cut-point helpers for the smooth-text pacer. Dependency-free (no React, no DOM
// beyond Intl.Segmenter) and domain-free by design — never emit a torn grapheme, never flash a
// partial word; no chat-domain wire-format knowledge belongs here.

const WORD_SNAP_LOOKAHEAD = 24;
const GRAPHEME_WINDOW = 256;
// Segment a little PAST `index` too — a cluster straddling the cut needs its closing code units in
// view for the segmenter to resolve the boundary correctly.
const GRAPHEME_LOOKAHEAD_PADDING = 16;
const WHITESPACE_RE = /\s/u;

const graphemeSegmenter: Intl.Segmenter | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/** Pulls a cut index back to the nearest grapheme-cluster boundary ≤ `index`, so a slice never splits a cluster. */
export function snapToGraphemeBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length || graphemeSegmenter === null) {
    return Math.max(0, Math.min(index, text.length));
  }
  const anchor = text.lastIndexOf(" ", index);
  const start =
    anchor >= 0 && index - anchor <= GRAPHEME_WINDOW
      ? anchor + 1
      : Math.max(0, index - GRAPHEME_WINDOW);
  let boundary = start;
  for (const seg of graphemeSegmenter.segment(
    text.slice(start, index + GRAPHEME_LOOKAHEAD_PADDING),
  )) {
    const abs = start + seg.index;
    if (abs > index) {
      break;
    }
    boundary = abs;
  }
  return boundary;
}

/**
 * Advances `from` to the next whitespace boundary (bounded lookahead so unbroken runs still flow).
 * Holds back a trailing still-growing partial word so a fragment never mounts.
 */
export function snapToWordBoundary(text: string, from: number): number {
  if (from >= text.length) {
    return text.length;
  }
  const limit = Math.min(text.length, from + WORD_SNAP_LOOKAHEAD);
  for (let i = from; i < limit; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i < text.length by the limit bound
    if (WHITESPACE_RE.test(text[i]!)) {
      return i;
    }
  }
  // No whitespace in the window. If it ran to the live tail (not the lookahead cap), hold back to
  // the last whitespace boundary in the prefix; otherwise it's a legitimately long unbroken run.
  if (limit >= text.length) {
    for (let i = from - 1; i >= 0; i--) {
      // biome-ignore lint/style/noNonNullAssertion: i >= 0 and i < text.length
      if (WHITESPACE_RE.test(text[i]!)) {
        return i + 1;
      }
    }
    return from;
  }
  return limit;
}
