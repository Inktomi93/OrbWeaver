// The DEAD-CLASS VOCABULARY — the one definition of "this class token is dead": how a class token is
// read out of a CSS selector, and which tokens are marker-only namespaces that legitimately ship no rule.
//
// TWO CONSUMERS, ONE DEFINITION (the reason this is kit and not either consumer's local const):
//   • the client's live `[css]` flagger (`packages/client/src/lib/motion-dead-class-flagger.ts`) — calls
//     the functions directly against the live CSSOM;
//   • `pnpm snap --dead-css` (`tooling/src/snap/ops/dead-css.ts`) — ships its scan as a RAW STRING into
//     `page.evaluate`, so it cannot import anything at runtime; it interpolates the DATA below (the
//     marker tables + the regex SOURCES) into that string instead.
// Two definitions would file two bug reports about one page, which is exactly what both files' headers
// already promised not to do.
//
// Kit-homed and isomorphic by construction: this module reads STRINGS. Neither the CSSOM walk nor the
// element walk is here — those are DOM, and they differ per consumer (a live MutationObserver vs. a
// one-shot census). What is shared is the vocabulary, and only the vocabulary.

/**
 * Marker-only class NAMESPACES that ship no CSS rule by design — Tailwind's named group/peer variants
 * and third-party marker classes. A prefix match, so `group/rail` and `lucide-check` are both covered.
 */
export const DEAD_CSS_MARKER_PREFIXES: readonly string[] = ["group/", "peer/", "lucide", "TanStack", "tsqd-"];

/** Marker-only class tokens matched WHOLE (the bare `group`/`peer` forms plus third-party markers). */
export const DEAD_CSS_MARKER_EXACT: readonly string[] = ["echarts-for-react", "group", "peer"];

/**
 * A class selector's token, un-escaped: a literal dot then a run of escaped-char-or-ident-char. Exported
 * as a regex SOURCE (not a `RegExp`) because the snap consumer must rebuild it inside the browser out of
 * a serialized string — `new RegExp(CLASS_SELECTOR_TOKEN_PATTERN, "g")` there is the same regex this
 * module compiles here, which is what makes the two scans provably agree.
 */
export const CLASS_SELECTOR_TOKEN_PATTERN = "\\.((?:\\\\.|[A-Za-z0-9_-])+)";

/** The un-escaper for a captured token (`\.` → `.`), same serialize-into-the-page reason as above. */
export const CLASS_TOKEN_ESCAPE_PATTERN = "\\\\(.)";

const CLASS_SELECTOR_TOKEN_RE = new RegExp(CLASS_SELECTOR_TOKEN_PATTERN, "g");
const CLASS_TOKEN_ESCAPE_RE = new RegExp(CLASS_TOKEN_ESCAPE_PATTERN, "g");

/** true ⇒ the token is a marker namespace, so having no CSS rule is correct and not a finding. */
export function isDeadCssMarkerClass(token: string): boolean {
  return DEAD_CSS_MARKER_EXACT.includes(token) || DEAD_CSS_MARKER_PREFIXES.some((prefix) => token.startsWith(prefix));
}

/**
 * Every class token one selector DEFINES a rule for, un-escaped. `.a .b\:c` → `["a", "b:c"]`. A selector
 * carrying no class yields an empty array; the caller decides what to do with that.
 */
export function classTokensInSelector(selector: string): string[] {
  const tokens: string[] = [];
  // `matchAll` (not a stateful `exec` loop): it clones the regex internally, so this module-level
  // pattern can never carry a `lastIndex` from one caller into the next.
  for (const match of selector.matchAll(CLASS_SELECTOR_TOKEN_RE)) {
    tokens.push((match[1] ?? "").replace(CLASS_TOKEN_ESCAPE_RE, "$1"));
  }
  return tokens;
}
