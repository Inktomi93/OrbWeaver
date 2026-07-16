// The D44 §12.1 / themes-design.md §4 custom-CSS validator — the shared LEAN check for a theme's
// self-authored CSS field (Tier B / global-owner tier, `UI-Theming-and-Content.md` §12.1: "the same
// validator" backs both the server write verb and the client code-editor's inline diagnostics). Kit-homed
// (isomorphic, pure, zero-dep) because both consumers span the cake the same way `isSafeColor` does: a
// server domain verb (`domain/settings`) AND `@orb/ui`'s code-editor, which cannot import `@orb/contracts`.
//
// Deliberately LEAN (themes-design.md §4): this is NOT a CSS parser — it pattern-matches the two known
// risk shapes and stops there. WARN (not reject) on `@import` (an exfil/untrusted-stylesheet vector, but
// not one that can escape the app document — a soft nudge). REJECT `position: fixed` / `position: sticky`
// (can lift the themed element out of its scope and overlay/break the app chrome — a real containment
// break, so it's an error, not a warning). Values are checked as SUBSTRINGS of the raw CSS text — the
// caller (a `<style>` scoped under a known app root, `UI-Theming-and-Content.md` §12.1) is the actual
// containment boundary; this validator is advisory + a shell-break guard, not a sandbox.

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
 * Validate a theme's self-authored custom CSS (themes-design.md §4 LEAN posture). Pure pattern-match —
 * no parsing, no DOM. `errors.length > 0` ⇒ the CSS must be rejected at the write boundary; `warnings`
 * are informational only.
 */
export function validateThemeCss(css: string): CssValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (IMPORT_RE.test(css)) {
    warnings.push("@import can load an untrusted stylesheet or leak data via the request — consider removing it.");
  }
  if (POSITION_FIXED_RE.test(css)) {
    errors.push("`position: fixed` is not allowed — it can escape the theme's scope over the app chrome.");
  }
  if (POSITION_STICKY_RE.test(css)) {
    errors.push("`position: sticky` is not allowed — it can escape the theme's scope over the app chrome.");
  }

  return { errors, warnings };
}
