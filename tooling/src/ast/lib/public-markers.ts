// The marker grammar shared by the AST liveness lenses.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { PublicMarker } from "../contract/types.ts";

const PUBLIC_TAG_RE = /@public(?=$|[\s-])(?<reason>[^\n]*)/u;

const JSDOC_TERMINATOR_RE = /\*\/\s*$/u;

/** Whether a declaration carries a reasoned marker, used as a conservative root by the AST lenses. */
export function isPublicTagged(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => {
      const reason = PUBLIC_TAG_RE.exec(range.getText())?.groups?.["reason"];
      return reason !== undefined && reason.replace(JSDOC_TERMINATOR_RE, "").trim().length > 0;
    });
}

// TSDoc uses spaces; line comments may use hyphens. Both spellings name the same marker.
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
 *  ONE HOME beside {@link isPublicTagged} so every AST lens reads the same grammar. Reads through
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
