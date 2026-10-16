// Syntax-only schema wrappers are shared by native capture and replay without loading semantic readers.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

export function unwrapSchemaExpression(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}
