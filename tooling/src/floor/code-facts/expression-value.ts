import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

/** Strip assertion, satisfies and parentheses wrappers without changing the underlying value. */
export function unwrapExpression(node: MorphNode): MorphNode {
  let n = node;
  while (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}
