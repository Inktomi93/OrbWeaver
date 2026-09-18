// domain/discovery/cooccurrence/utils — pure helpers shared by the cooccurrence write side (generate.ts) +
// read side (retrieve.ts). Cross-file inside ONE subsystem is fine; cross-subsystem is blocked by
// `domain-no-cross-subsystem`. Was the previous codebase’s `corpus/cooccurrence/utils.ts` (the `/u` regex flags dropped —
// the patterns are ASCII, and `useUnicodeRegex` is deliberately removed from biome.json).

// A leading English article (folded so "the crown" and "crown" collapse to one key).
const LEADING_ARTICLE = /^(?:the|a|an)\s+/;
// Trailing whitespace/punctuation (trimmed so "duel." and "duel" collapse).
const TRAILING_PUNCT = /[\s.,;:!?'"]+$/;
// Minimum keyword length — shorter tokens are noise / hub-prone and are dropped.
const MIN_KEYWORD_LEN = 4;

/**
 * Normalize a raw scene keyword to a comparison key, or `null` to drop it: lowercase, fold a leading article,
 * trim trailing punctuation, require ≥ {@link MIN_KEYWORD_LEN} chars (short tokens are noise / hub-prone).
 */
export function normalizeKeyword(kw: string): string | null {
  let k = kw.trim().toLowerCase();
  k = k.replace(LEADING_ARTICLE, "");
  k = k.replace(TRAILING_PUNCT, "").trim();
  return k.length >= MIN_KEYWORD_LEN ? k : null;
}
