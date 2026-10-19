import type { AsExpression, Node as MorphNode, ParenthesizedExpression, SatisfiesExpression } from "ts-morph";
import { Node } from "ts-morph";

// The wrappers that carry a value through unchanged: an assertion, `satisfies`, parentheses.
function isValueWrapper(node: MorphNode): node is AsExpression | SatisfiesExpression | ParenthesizedExpression {
  return Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isParenthesizedExpression(node);
}

/** Strip assertion, satisfies and parentheses wrappers without changing the underlying value. */
export function unwrapExpression(node: MorphNode): MorphNode {
  let n = node;
  while (isValueWrapper(n)) {
    n = n.getExpression();
  }
  return n;
}

/** The outermost expression that {@link unwrapExpression} reduces to `node`: the slot `node`'s value fills. */
export function wrappedValue(node: MorphNode): MorphNode {
  let value = node;
  let parent = value.getParent();
  while (parent !== undefined && isValueWrapper(parent) && parent.getExpression() === value) {
    value = parent;
    parent = value.getParent();
  }
  return value;
}

/** The values an `apply`-style call spreads into its target's parameters: the elements of an array-literal argument. */
export function applyArgumentValues(argument: MorphNode | undefined): readonly MorphNode[] | undefined {
  return argument !== undefined && Node.isArrayLiteralExpression(argument) ? argument.getElements() : undefined;
}
