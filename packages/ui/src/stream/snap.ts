// Pure string-math cut-point helpers for the smooth-text pacer (ui-package-design §6.3.1). Kept
// dependency-free (no React, no DOM beyond `Intl.Segmenter`) so they're cheap to unit-test directly —
// these are the exact "reveal-quality contracts" golden tests target: never emit a torn grapheme,
// never flash a partial word.
//
// Domain-free by design: neo's original (`use-smooth-text.ts`) also held back a trailing unterminated
// `<` (a `<speaker>`-tag hold-back for its chat wire format). That's chat-domain knowledge and is
// deliberately NOT ported here — ui-package-design §6.3.1 flags it as a decision for the chat-client
// chunk ("re-pin or retire... by whether orbweaver's chat keeps neo's `<speaker>`-span wire format"),
// not something this domain-agnostic primitive should bake in.

const WORD_SNAP_LOOKAHEAD = 24;
const GRAPHEME_WINDOW = 256;
// Segment a little PAST `index` too — a cluster straddling the cut needs its closing code units in
// view for the segmenter to resolve the boundary correctly.
const GRAPHEME_LOOKAHEAD_PADDING = 16;
const WHITESPACE_RE = /\s/u;

const graphemeSegmenter: Intl.Segmenter | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/**
 * Pulls a cut index back to the nearest grapheme-cluster boundary ≤ `index`, so a slice never splits
 * a surrogate pair (emoji → U+FFFD), a ZWJ sequence (👨‍👩‍👧 decomposing into its parts), or a
 * combining mark off its base. Whitespace is always a boundary, so the segmenter window is anchored
 * at the last whitespace before the cut (or `GRAPHEME_WINDOW` back for unbroken runs — clusters are
 * short, so a windowed segmentation realigns fast). Falls back to a plain clamp when
 * `Intl.Segmenter` is unavailable (SSR / very old runtimes).
 */
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
 * Advances `from` to the next whitespace boundary in `text` (bounded lookahead so unbroken runs —
 * long URLs, CJK prose — still flow instead of stalling).
 *
 * Holds back the trailing partial word: when the scan reaches the END of the (still-growing) target
 * without hitting whitespace, the tail is a word still being emitted — reveal only back to the last
 * whitespace boundary in the prefix so a fragment never mounts. The next chunk brings the whitespace
 * that completes the word, or the stream finishes (`enabled` flips off, the strict passthrough
 * returns the full text).
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
  // No whitespace within the window. If the window ran to the LIVE tail of the target (not the
  // LOOKAHEAD cap), the unbroken run is a still-growing partial word — hold it back to the last
  // whitespace boundary in the prefix. If we hit the cap instead, it's a legitimately long unbroken
  // run; let it flow.
  if (limit >= text.length) {
    for (let i = from - 1; i >= 0; i--) {
      // biome-ignore lint/style/noNonNullAssertion: i >= 0 and i < text.length
      if (WHITESPACE_RE.test(text[i]!)) {
        return i + 1;
      }
    }
    // No earlier boundary (the whole shown prefix is one unbroken run) — flow it rather than freeze
    // the reveal at zero.
    return from;
  }
  return limit;
}
