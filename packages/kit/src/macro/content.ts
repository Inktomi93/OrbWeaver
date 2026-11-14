// kit/macro/content — the scoped-block body normalizer (ST's trimContent shape
// adopted). A universal block's resolved body is trimmed + indentation-DEDENTED before it becomes the
// macro's last unnamed argument, so an author can indent a multiline body to the macro's column without
// the indentation leaking into the value; the `#` PRESERVE_WHITESPACE flag bypasses this whole
// helper (the evaluator passes the body verbatim). Pure string→string — no ctx, no registry.

// Neutralize `{{`/`}}` in untrusted text so it can't be mistaken for a macro by ANY downstream pass.
// Homed HERE because the user-macro handler (user-macros.ts) splices untrusted arg/input values into an
// author template and needs exactly this defense; guided imports it from here (one home, D51 posture).
//
// SECURITY: U+200B goes after EVERY brace that another brace of the same kind follows, so no run of
// braces keeps an adjacent pair. The parser opens a tag at any `{{` (`text.indexOf("{{", pos)`), and
// a pair-at-a-time rewrite leaves one inside an odd run: `{{{x}}}` became `{<ZWSP>{{x}<ZWSP>}}`, which
// parses as `{{x}<ZWSP>}}` and evaluates. A zero-width space outside the braces is no defense either,
// because the `{{` stays intact. An exact `{{` or `}}` still gets the one U+200B between its braces,
// the bytes stored lore and stashed cards already hold. Keep the code point exact.
const ZWSP = "\u200B";
export function neutralizeMacros(s: string): string {
  return s.replace(/\{(?=\{)/g, `{${ZWSP}`).replace(/\}(?=\})/g, `}${ZWSP}`);
}

/** UTF-8 byte length for the macro engine's input and output belts. `null` means the source contains
 *  an unpaired surrogate and therefore has no well-formed UTF-8 encoding. */
export function utf8ByteLength(source: string): number | null {
  if (!source.isWellFormed()) {
    return null;
  }
  return encodeURIComponent(source).replace(/%[0-9A-F]{2}/g, "_").length;
}

/** The two identity macros this helper substitutes. Exact `{{char}}`/`{{user}}` tokens (case-insensitive,
 *  NO whitespace-in-braces tolerance — that matches both original call sites and the card-format canon). */
export interface IdentityMapping {
  /** Replacement for `{{char}}`. */
  readonly char: string;
  /** Replacement for `{{user}}`. */
  readonly user: string;
}

// One combined pass over both tokens: a single regex alternation resolves each match INDEPENDENTLY from
// `mapping`, so an inversion ({char:"{{user}}", user:"{{char}}"}) can never double-swap — the emitted text
// is not re-scanned. Function replacement (not string) is load-bearing: a replacement containing `$&`/`$$`
// (a persona/user NAME could) splices VERBATIM instead of being interpreted as a `$`-pattern.
const IDENTITY_MACRO_RE = /\{\{(char|user)\}\}/gi;

/** Substitute the identity macros `{{char}}`/`{{user}}` (case-insensitive) with the values in `mapping`.
 *  Used OUTSIDE a live turn context (persona role-inversion copy, embedding name-projection) where the full
 *  macro engine is overkill. Handles both hazards at once: no double-swap on inversion, no `$`-pattern
 *  splice on name projection. */
export function swapIdentityMacros(text: string, mapping: IdentityMapping): string {
  return text.replace(IDENTITY_MACRO_RE, (_match, token: string) => (token.toLowerCase() === "char" ? mapping.char : mapping.user));
}

// Leading run of indentation characters (spaces/tabs) — counted per line for the common-dedent.
function indentWidth(line: string): number {
  let i = 0;
  while (i < line.length && (line.charAt(i) === " " || line.charAt(i) === "\t")) {
    i += 1;
  }
  return i;
}

/** Normalize a scoped-block body: strip the COMMON leading indentation from every line after the first
 *  (line 0 sits on the open tag's own line — its column is the tag's, not authored indent), then trim
 *  both ends. Blank lines don't vote on the common indent (they'd force it to 0) and dedent to at most
 *  their own width. Dedent counts CHARACTERS (space or tab), not visual columns — a body mixing tabs and
 *  spaces across lines dedents by the shorter run, never eats a non-whitespace char. */
export function trimContent(content: string): string {
  let text = content;
  const lines = text.split("\n");
  let common = Number.POSITIVE_INFINITY;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      continue;
    }
    const width = indentWidth(line);
    if (width < common) {
      common = width;
    }
  }
  if (Number.isFinite(common) && common > 0) {
    text = lines.map((line, i) => (i === 0 ? line : line.slice(Math.min(common, indentWidth(line))))).join("\n");
  }
  return text.trim();
}
