// Capture and replay share the same finite syntax dependencies; only supplied native facts carry meaning.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { unwrapSchemaExpression } from "./schema-expression.ts";

/** Transparent authored wrappers retain their own anchor and their inner value's independent native observations. */
export function schemaConfigurationChildren(node: MorphNode, stable: ReferenceFact<MorphNode>): readonly MorphNode[] {
  const unwrapped = unwrapSchemaExpression(node);
  const children = unwrapped === node ? [] : [unwrapped];
  if (stable.kind === "resolved" && Node.isArrayLiteralExpression(stable.value)) {
    children.push(...stable.value.getElements().map((element) => (Node.isSpreadElement(element) ? element.getExpression() : element)));
  }
  return children;
}
