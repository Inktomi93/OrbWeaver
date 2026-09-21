// The @public marker family — read by orphans/chains/apisurface AND the push-tier ratchet
// through the SAME predicate (one definition of a marker claim; the ratchet adjudicates legality).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { PublicMarker } from "../contract/types.ts";

const PUBLIC_TAG_RE = /@public(?=$|[\s-])(?<reason>[^\n]*)/u;

const JSDOC_TERMINATOR_RE = /\*\/\s*$/u;

/** Does this declaration carry `/** @public <reason> *\/` in a LEADING comment, WITH a reason? This is
 *  deliberately a conservative graph-root predicate, not a ruling that the marker is a legal exemption.
 *
 *  ONE HOME, deliberately: the push-tier ratchet (tooling/src/verify/ops/orphan-export-ratchet.ts) reads this to
 *  decide which orphan candidates it judges, and the `chains` fixpoint reads it to decide which declarations
 *  are ALIVE ROOTS. Two spellings of the predicate would let the two disagree about what "deliberately
 *  unconsumed" means — and the chain lens would then report a whole tree hanging off a head the ratchet is
 *  responsible for adjudicating. Reads through {@link commentHost}: a tagged `export const`'s JSDoc sits on the
 *  VariableStatement, not on the VariableDeclaration the liveness keys on. */
export function isPublicTagged(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => {
      const reason = PUBLIC_TAG_RE.exec(range.getText())?.groups?.["reason"];
      return reason !== undefined && reason.replace(JSDOC_TERMINATOR_RE, "").trim().length > 0;
    });
}

// The two NAMED, gate-verifiable anti-rot markers that SPLIT the old blanket `@public` exemption
// (docs/history/reviews/misc/2026-08-09-api-surface-classification.md — the parking-permit hole). A bare `@public`
// only ever lands on an UNUSED export (a consumed export is not an orphan candidate), so `@public` was
// certifying "intended-but-unconsumed" behind a prose reason a barrels lane writes for genuine rot as easily
// as for real future API. The split forces the claim to name a CHECKABLE target:
//   • `@public-twin: <ValueName>`   — the export is the type FACE of a value that is genuinely cross-package
//     PUBLIC api. The ratchet reds it unless apisurface classifies `<ValueName>` PUBLIC — a twin of an
//     INTERNAL (same-package-only) or UNUSED value is itself rot (an internal shape's type-face is not a
//     cross-boundary surface), so it must be DELETED, not parked.
//   • `@public-future: <named consumer/surface>` — a deliberately-unconsumed export waiting for a NAMED,
//     not-yet-built consumer. The reason is REQUIRED and must name the unbuilt surface.
// A BARE `@public <reason>` (the legacy spelling) is NO LONGER a legal orphan exemption — it reds, with the
// remedy "migrate to `@public-twin:`/`@public-future:` naming the target, or DELETE." Both new markers are
// two-sided from birth (the house shape): a twin whose value stops being PUBLIC reds; any `@public`-family
// marker that GAINS a prod consumer reds via the existing stale arm. Read the marker's line stripped of the
// JSDoc terminator (the `*/`-satisfies-`\S` footgun documented at PUBLIC_TAG_RE).
// The separator between `@public` and the twin/future keyword tolerates a HYPHEN or a SPACE: `@public-twin:`
// reads cleanest, but inside a `/** */` JSDoc block eslint's tsdoc/syntax rejects the hyphen (`@public` is a
// real TSDoc modifier tag; `@public-twin` is a malformed one), so package markers are authored `@public twin:`
// (the `@public` tag + text). Both spellings parse here; `//`-line markers may keep the hyphen.
const PUBLIC_TWIN_RE = /@public[-\s]+twin:(?<value>[^\n]*)/u;

const PUBLIC_FUTURE_RE = /@public[-\s]+future:(?<reason>[^\n]*)/u;

/** Splits a twin marker's tail on whitespace so the FIRST token is the named value (prose may follow). */
const MARKER_VALUE_SPLIT_RE = /\s+/u;

/** Strip the JSDoc terminator and surrounding space off a captured marker tail; empty ⇒ no legal reason. */
function markerTail(raw: string | undefined): string {
  return (raw ?? "").replace(JSDOC_TERMINATOR_RE, "").trim();
}

/** The `@public`-family marker in ONE comment's text, or undefined. Checks the two NAMED forms FIRST (the bare
 *  marker also admits the legacy hyphen separator, so order is the disambiguator), then the
 *  legacy bare form. `twin.value` is the FIRST token after the colon (prose may follow); a colon-marker with
 *  an empty tail falls through to bare (an unnamed twin/future is not a legal named exemption). */
function markerInComment(text: string): PublicMarker | undefined {
  const twin = markerTail(PUBLIC_TWIN_RE.exec(text)?.groups?.["value"]);
  if (twin.length > 0) {
    return { kind: "twin", value: twin.split(MARKER_VALUE_SPLIT_RE)[0] ?? twin };
  }
  const future = markerTail(PUBLIC_FUTURE_RE.exec(text)?.groups?.["reason"]);
  if (future.length > 0) {
    return { kind: "future", reason: future };
  }
  const bare = markerTail(PUBLIC_TAG_RE.exec(text)?.groups?.["reason"]);
  return bare.length > 0 ? { kind: "bare", reason: bare } : undefined;
}

/** The `@public`-family marker on `decl` (the first of its leading comments that carries one), or undefined.
 *  ONE HOME beside {@link isPublicTagged} so the ratchet and any lens read the same grammar. Reads through
 *  {@link commentHost} (a tagged `export const`'s JSDoc sits on the VariableStatement). */
export function publicMarkerOf(decl: Node): PublicMarker | undefined {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .map((range) => markerInComment(range.getText()))
    .find((marker) => marker !== undefined);
}

/** A candidate as a printable Hit — `<name>  —  <declaration line>`, the form both lists use. */

/** The node whose LEADING comments document a declaration. A `// …` line above `export const x = …` attaches
 *  to the VariableStatement, not to the VariableDeclaration `getExportedDeclarations()` hands back — reading
 *  comments off the declaration alone would make every `const`-shaped marker invisible. */
export function commentHost(decl: Node): Node {
  return decl.getFirstAncestorByKind(SyntaxKind.VariableStatement) ?? decl;
}
