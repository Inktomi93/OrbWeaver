// initials — a display name → a 1–2 char avatar-fallback glyph. ONE grapheme-safe home for what were four
// near-identical local copies across features (character library, chat attribution, the two persona
// panels — §13.0's third-consumer bar exceeded). Semantics: the first grapheme of the FIRST word + the
// first grapheme of the LAST word ("Alex Silver" → "NS"; "John F. Kennedy" → "JK"; a single word → its
// first grapheme; empty/whitespace-only → "?").
//
// Grapheme-safe by construction: `Intl.Segmenter` yields whole grapheme CLUSTERS, so a name led by an
// emoji/astral char ("😀Bob") returns "😀" — never the lone high surrogate that `charAt(0)`/`slice(0,1)`
// split off (the well-formedness bug this module supersedes). The repo ships grapheme-cluster-safe
// streaming (UI-Arch §6.3.1) — initials now match that guarantee.

/** Reusable + stateless across `segment()` calls; created once. Locale-default is correct for grapheme
 *  granularity (grapheme boundaries are locale-independent in the UAX-29 default). */
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const WHITESPACE_RE = /\s+/;
const FALLBACK = "?";

/** The first grapheme cluster of `word` (empty string when `word` is empty). */
function firstGrapheme(word: string): string {
  for (const { segment } of GRAPHEME_SEGMENTER.segment(word)) {
    return segment;
  }
  return "";
}

/** First-word + last-word initial, grapheme-safe. Empty/whitespace-only → `"?"`. */
export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(WHITESPACE_RE)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return FALLBACK;
  }
  const first = firstGrapheme(words[0] ?? "");
  const last = words.length > 1 ? firstGrapheme(words.at(-1) ?? "") : "";
  const initials = (first + last).toUpperCase();
  return initials.length > 0 ? initials : FALLBACK;
}
