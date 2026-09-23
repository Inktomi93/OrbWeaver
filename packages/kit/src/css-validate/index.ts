// The D44 §12.1 custom-CSS validator — the shared LEAN check for a theme's
// self-authored CSS field (Tier B / global-owner tier, `UI-Theming-and-Content.md` §12.1: "the same
// validator" backs both the server write verb and the client code-editor's inline diagnostics). Kit-homed
// (isomorphic, pure, zero-dep) because both consumers span the cake the same way `isSafeColor` does: a
// server domain verb (`domain/settings`) AND `@orb/ui`'s code-editor, which cannot import `@orb/contracts`.
//
// Deliberately LEAN: this is NOT a CSS parser — it pattern-matches the two known
// risk shapes and stops there. WARN (not reject) on `@import` (an exfil/untrusted-stylesheet vector, but
// not one that can escape the app document — a soft nudge). REJECT `position: fixed` / `position: sticky`
// (can lift the themed element out of its scope and overlay/break the app chrome — a real containment
// break, so it's an error, not a warning). Values are checked as SUBSTRINGS of the ACTIVE CSS text
// (comments and quoted strings blanked first — see below) — the caller (a `<style>` scoped under a known
// app root, `UI-Theming-and-Content.md` §12.1) is the actual containment boundary; this validator is
// advisory + a shell-break guard, not a sandbox.

// ── comments and strings are NOT active CSS (#1360 item 3) ───────────────────────────────────────────
// The three patterns below are substring tests over raw text, so before this they fired inside
// `/* position: fixed */` and inside a quoted `content: "@import"` — a pure FALSE POSITIVE that rejects
// an author's own note about the rule they are obeying. The false-NEGATIVE direction was probed and does
// not exist: because the tests are context-free, hiding a real declaration inside a comment did not evade
// them either, so stripping comments/strings FIRST loses no coverage. It stays LEAN — this strips the two
// inert regions and stops; it is still not a CSS parser and the scoped `<style>` element is still the
// containment boundary.
const COMMENT_RE = /\/\*[\s\S]*?(?:\*\/|$)/gu;
const STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gu;

/** Blank out comments and quoted strings, preserving LENGTH and newlines so any position an author's
 *  editor computes from the raw text still lines up. */
function activeCssOnly(css: string): string {
  const blank = (match: string): string => match.replace(/[^\n]/gu, " ");
  return css.replace(COMMENT_RE, blank).replace(STRING_RE, blank);
}

const IMPORT_RE = /@import\b/iu;
const POSITION_FIXED_RE = /position\s*:\s*fixed\b/iu;
const POSITION_STICKY_RE = /position\s*:\s*sticky\b/iu;

/** One validation finding, human-readable (surfaced verbatim as a diagnostic / a thrown error message). */
export interface CssValidationResult {
  /** Containment breaks — the write verb REJECTS the CSS when this is non-empty. */
  readonly errors: readonly string[];
  /** Advisory-only — the CSS is accepted, but the caller (verb / editor) may surface these to the author. */
  readonly warnings: readonly string[];
}

/**
 * Validate a theme's self-authored custom CSS (the LEAN posture). Pure pattern-match —
 * no parsing, no DOM. `errors.length > 0` ⇒ the CSS must be rejected at the write boundary; `warnings`
 * are informational only.
 */
export function validateThemeCss(css: string): CssValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Comments and quoted strings are inert; only what remains can actually apply (#1360 item 3).
  const active = activeCssOnly(css);

  if (IMPORT_RE.test(active)) {
    warnings.push("@import can load an untrusted stylesheet or leak data via the request — consider removing it.");
  }
  if (POSITION_FIXED_RE.test(active)) {
    errors.push("`position: fixed` is not allowed — it can escape the theme's scope over the app chrome.");
  }
  if (POSITION_STICKY_RE.test(active)) {
    errors.push("`position: sticky` is not allowed — it can escape the theme's scope over the app chrome.");
  }

  return { errors, warnings };
}
