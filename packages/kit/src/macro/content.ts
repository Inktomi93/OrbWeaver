// kit/macro/content — the M1 scoped-block body normalizer (parity-plus §12A.1, ST's trimContent shape
// adopted). A universal block's resolved body is trimmed + indentation-DEDENTED before it becomes the
// macro's last unnamed argument, so an author can indent a multiline body to the macro's column without
// the indentation leaking into the value; the `#` PRESERVE_WHITESPACE flag (§12A.4) bypasses this whole
// helper (the evaluator passes the body verbatim). Pure string→string — no ctx, no registry.

// Neutralize `{{`/`}}` in untrusted text so it can't be mistaken for a macro by ANY downstream pass.
// Homed HERE (not kit/guided, its original home) because the M5 user-macro handler (user-macros.ts)
// splices untrusted arg/input values into an author template and needs exactly this defense — guided
// re-exports it, so every existing `@orb/kit/guided` consumer is unchanged (one home, D51 posture).
//
// IMPORTANT: U+200B goes BETWEEN the two braces, not before/after the pair. The macro parser scans
// with `text.indexOf("{{", pos)` — placing the zero-width-space outside the pair leaves the `{{`
// token intact and indexOf still finds it, so the defense would be a no-op. Inserting U+200B
// between the braces gives `{<ZWSP>{`, which the indexOf scan can no longer match. Output looks
// identical to a human (U+200B is invisible) and round-trips through every storage layer that
// preserves Unicode. The U+200B codepoint is load-bearing — keep it exact.
export const ZWSP = "​";
export function neutralizeMacros(s: string): string {
  return s.replace(/\{\{/g, `{${ZWSP}{`).replace(/\}\}/g, `}${ZWSP}}`);
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

export interface TrimContentOptions {
  /** `false` skips the indent-dedent (the ends are still trimmed). Default `true`. */
  trimIndent?: boolean;
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
export function trimContent(content: string, opts: TrimContentOptions = {}): string {
  let text = content;
  if (opts.trimIndent !== false) {
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
  }
  return text.trim();
}
