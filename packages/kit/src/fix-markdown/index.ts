// Ported from SillyTavern's `power-user.js:fixMarkdown`. LLMs frequently emit slightly-broken markdown:
//
//   1. `* text *` — italic markers with adjacent whitespace that showdown /
//      react-markdown treat as literal rather than emphasis. Fix: strip the
//      inner space → `*text*`.
//
//   2. Unpaired `*` or `"` on a line — close the marker at end-of-line so
//      render doesn't eat the rest of the message. Only when `forDisplay=true`
//      because the `continue` verb can legitimately leave a marker open across
//      the appended chunk boundary.
//
// Called AFTER macro substitution + DISPLAY regex, BEFORE react-markdown.
// docs/architecture/chat-resolution-pipeline.md §DISPLAY.

import remend from "remend";

// Paired `*…*` / `**…**` / `_…_` / `__…__` markers (lazy inner, multiline). Hoisted to module scope —
// `useTopLevelRegex` forbids in-function literals; `matchAll` clones the regex so its `lastIndex` is
// never shared across calls.
const PAIR_FINDER = /([*_]{1,2})([\s\S]*?)\1/gm;
// (start-marker)(unicode whitespace+) OR (unicode whitespace+)(end-marker) — every Unicode space the
// emphasis run might pad with, so `* x *` → `*x*` regardless of which space the model used.
const SPACE_CLASS = "\\t \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000\\ufeff";
const PAIR_INNER_WHITESPACE = new RegExp(
  `(\\*|_)([${SPACE_CLASS}]+)|([${SPACE_CLASS}]+)(\\*|_)`,
  "g",
);

// A `<speaker` open-tag marker (case-insensitive, optional attrs). The narrator render
// (parse-speaker-spans.ts) splits the body on well-formed `<speaker>Name</speaker>` markers; a
// streamed frame can land mid-marker. `holdTornSpeaker` strips from the last unclosed `<speaker` open
// tag to the end so the frame holds it back until the close arrives in a later tick.
const SPEAKER_OPEN_TAG = /<\s*speaker\b[^>]*>/gi;
const SPEAKER_CLOSE_TAG = /<\s*\/\s*speaker\s*>/i;

// `% EVEN` parity test, named so the modulus isn't a bare literal (noMagicNumbers).
const EVEN = 2;
// Sentinel for "no `<speaker` open tag found" — distinct from a real index ≥ 0.
const NOT_FOUND = -1;

export function fixMarkdown(text: string, forDisplay: boolean): string {
  // 1. Strip adjacent whitespace inside paired markers. Always runs (settled + display paths).
  const stripped = stripInnerWhitespace(text);

  // 2. Only the display path closes unpaired markers (continue verbs need to leave them open so the
  //    next chunk continues the same span).
  if (!forDisplay) {
    return stripped;
  }
  return stripped.split("\n").map(closeUnpairedMarkers).join("\n");
}

/** Splice the inner-whitespace fix into each paired marker from the END, so earlier match indices
 *  stay stable while we rewrite. */
function stripInnerWhitespace(text: string): string {
  const matches = [...text.matchAll(PAIR_FINDER)].map((m) => ({
    index: m.index,
    full: m[0] ?? "",
  }));
  let next = text;
  // Descending index order keeps each splice from invalidating the indices still to be applied.
  for (const { index, full } of matches.toReversed()) {
    const inner = full.replace(PAIR_INNER_WHITESPACE, "$1$4");
    next = next.slice(0, index) + inner + next.slice(index + full.length);
  }
  return next;
}

/** Close unpaired `**`, `*`, and `"` at end-of-line so a half-open span doesn't swallow the rest of
 *  the rendered message. */
function closeUnpairedMarkers(line: string): string {
  // `**` pairs FIRST, counted as units: "**bold start" has an EVEN raw `*` count, so the single-char
  // counter below never saw it and raw `**` rendered to the user (remend-audit catch, 2026-06). Close
  // the bold run, then count the LEFTOVER single stars after removing `**` units.
  let patched = line;
  if (isOdd(countOccurrences(patched, "**"))) {
    patched = `${patched.trimEnd()}**`;
  }
  if (patched.includes("*") && isOdd(countOccurrences(patched.replaceAll("**", ""), "*"))) {
    patched = `${patched.trimEnd()}*`;
  }
  if (patched.includes('"') && isOdd(countOccurrences(patched, '"'))) {
    patched = `${patched.trimEnd()}"`;
  }
  return patched;
}

// Stream-only: {@link fixMarkdown} can't close partial constructs — it runs on settled messages too,
// where rewriting a partial would permanently alter the output. This applies only on the streaming
// ghost path (MessageBody, streaming=true).
//
// Delegates to `remend` (Vercel's streamdown repair engine — an isomorphic, side-effect-free kit dep
// per the kit-purity ruling, `core/Legacy-Migration-and-Gaps.md` §0). One sentinel: an incomplete link
// becomes `[text](streamdown:incomplete-link)` — the unknown protocol is stripped by rehype-sanitize
// downstream, rendering the text link-styled but inert until the real URL finishes. The hand-rolled
// repairs remend replaced are pinned in the test as behavior locks against remend upgrades.

export function repairStreamingTail(text: string): string {
  return holdTornSpeaker(remend(text));
}

/** Strip a trailing `<speaker…>` open tag that has no `</speaker>` close after it (a torn narrator
 *  span mid-stream). A complete `<speaker>…</speaker>` is left intact. Cheap fast-path: no
 *  `<speaker` present → return as-is.
 *
 *  EXPORTED (#38): the streaming markdown seal calls this DIRECTLY rather than the full
 *  {@link repairStreamingTail}. Streamdown 2.5's own `parseIncompleteMarkdown` already runs `remend`
 *  internally in streaming mode, so the `remend(text)` half of `repairStreamingTail` is redundant on
 *  that path — but Streamdown's repair does NOT balance/hold a fully-open custom `<speaker>` tag
 *  awaiting its close (verified: remend's html-tag handling only truncates a still-open *opening* tag
 *  scan). This hold-back is therefore the genuinely-unique piece the seal keeps. */
export function holdTornSpeaker(text: string): string {
  SPEAKER_OPEN_TAG.lastIndex = 0;
  let lastOpenIndex = NOT_FOUND;
  for (const m of text.matchAll(SPEAKER_OPEN_TAG)) {
    lastOpenIndex = m.index;
  }
  if (lastOpenIndex === NOT_FOUND) {
    return text;
  }
  // A `</speaker>` after the last open tag means that open tag is closed → settled, leave it.
  if (SPEAKER_CLOSE_TAG.test(text.slice(lastOpenIndex))) {
    return text;
  }
  // Unclosed trailing open tag → hold everything from it back.
  return text.slice(0, lastOpenIndex);
}

// Non-overlapping occurrence count: N occurrences split a string into N+1 pieces. (A bit-accumulator
// counter trips biome's nursery noMisleadingReturnType, which can't see `count += 1` widen to number.)
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function isOdd(n: number): boolean {
  return n % EVEN === 1;
}
