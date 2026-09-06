// The STATIC half of an authored template literal, plus its interpolation holes, as one reader.
// `readStaticString` deliberately refuses a `TemplateExpression` — its value depends on runtime — but two
// policies need the text a template CANNOT vary (the quasis) and the expressions it CAN (the holes): a
// `reports/`-carrying path prefix is authored in a quasi even when the filename is interpolated, and a
// SQL `length(col) <= ${CAP}` cap is a quasi skeleton with the cap in a hole. Reading the two apart is what
// keeps a needle inside an interpolated expression from counting as authored text.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readStaticString, referenceResolutionServices } from "./reference-fact.ts";

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
