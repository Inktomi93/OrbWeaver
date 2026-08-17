// Comment blanking for the LINE-SCANNING gates (issue #117): a `#106` issue citation in a comment read as
// a 3-digit hex color and reddened two lanes in one day. The harness is pure-AST by its own law
// (GATE-AUTHORING.md §1) — comments are trivia a value scan must skip. Both helpers return text of the
// SAME LENGTH with comment characters replaced by spaces and newlines preserved, so a caller's
// `split("\n")` line numbers and column offsets stay exact.
import type { SourceFile } from "ts-morph";

const SPACE = " ";
const CSS_COMMENT_CLOSE = "*/";

/** Replace `[start,end)` with spaces, keeping every newline (line count + offsets are invariant). */
function blankRange(text: string, start: number, end: number): string {
  const span = text.slice(start, end).replace(/[^\n]/gu, SPACE);
  return text.slice(0, start) + span + text.slice(end);
}

/** Every comment span in a parsed TS/TSX file, blanked. Comments are TRIVIA: they attach as leading
 *  ranges of some token, and ts-morph's `getDescendants()` walks tokens (not just the `forEachChild`
 *  nodes), so a comment before a `)` / `}` / EOF is covered too — which a node-only walk misses. Using the
 *  real parse rather than a hand-rolled scanner is what keeps a `//` inside a string or a regex literal
 *  from being mistaken for a comment opener. */
export function blankTsComments(sf: SourceFile): string {
  let text = sf.getFullText();
  const seen = new Set<number>();
  const spans: { readonly pos: number; readonly end: number }[] = [];
  for (const node of [sf, ...sf.getDescendants()]) {
    for (const range of node.getLeadingCommentRanges()) {
      const pos = range.getPos();
      if (!seen.has(pos)) {
        seen.add(pos);
        spans.push({ pos, end: range.getEnd() });
      }
    }
  }
  // Descending so an earlier blank can never move a later span's offsets (lengths are preserved anyway;
  // the order makes that independent of the invariant).
  for (const span of spans.sort((a, b) => b.pos - a.pos)) {
    text = blankRange(text, span.pos, span.end);
  }
  return text;
}

/** Index just past the CSS string literal starting at `i` (an unterminated one runs to EOF). */
function endOfCssString(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") {
      j += 2;
      continue;
    }
    if (text[j] === quote) {
      return j + 1;
    }
    j += 1;
  }
  return j;
}

/** Every block-comment span in a CSS file's text, blanked. Quote state is tracked so a comment opener
 *  inside a string value is not read as a comment; CSS has no line-comment form, so a `//` (the one in
 *  `url(https://…)`) is deliberately left alone. */
export function blankCssComments(text: string): string {
  let out = text;
  let i = 0;
  while (i < out.length) {
    const ch = out[i];
    if (ch === '"' || ch === "'") {
      i = endOfCssString(out, i);
      continue;
    }
    if (ch === "/" && out[i + 1] === "*") {
      const close = out.indexOf(CSS_COMMENT_CLOSE, i + 2);
      const end = close === -1 ? out.length : close + CSS_COMMENT_CLOSE.length;
      out = blankRange(out, i, end);
      i = end;
      continue;
    }
    i += 1;
  }
  return out;
}
