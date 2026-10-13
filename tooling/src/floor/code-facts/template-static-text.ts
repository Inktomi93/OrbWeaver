// Static template quasis and interpolation expressions are separate facts.
// A reports path or SQL cap in a hole is runtime data, never authored static evidence.

import { readStaticString, referenceResolutionServices } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

export interface TemplateSkeleton {
  /** Cooked literal texts, in order. Always exactly `holes.length + 1` entries. */
  readonly quasis: readonly string[];
  /** The substitution expressions, in order. */
  readonly holes: readonly MorphNode[];
  /** The quasis joined with the interpolations REMOVED — text the template cannot vary. */
  readonly staticText: string;
}

/** Read a template literal's quasis and holes, or null when the node is not a template. */
export function readTemplateSkeleton(node: MorphNode): TemplateSkeleton | null {
  const current = referenceResolutionServices.unwrapExpression(node);
  if (Node.isNoSubstitutionTemplateLiteral(current)) {
    return { quasis: [current.getLiteralText()], holes: [], staticText: current.getLiteralText() };
  }
  if (!Node.isTemplateExpression(current)) {
    return null;
  }
  const quasis = [current.getHead().getLiteralText()];
  const holes: MorphNode[] = [];
  for (const span of current.getTemplateSpans()) {
    holes.push(span.getExpression());
    quasis.push(span.getLiteral().getLiteralText());
  }
  return { quasis, holes, staticText: quasis.join("") };
}

/** The authored text a node CANNOT vary: a static string through the shared binding resolver, or a
 *  template's quasis with every interpolation removed. Null when the node carries no authored text. */
export function readStaticTextOf(node: MorphNode): string | null {
  const literal = readStaticString(node);
  if (literal.kind === "resolved") {
    return literal.value;
  }
  const skeleton = readTemplateSkeleton(node);
  return skeleton === null ? null : skeleton.staticText;
}
