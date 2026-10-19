import type { AsExpression, CallExpression, Node as MorphNode, ParenthesizedExpression, SatisfiesExpression } from "ts-morph";
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

const APPLY_FORWARDER = "apply";

/** The member a call is made through, when it is spelled out: `x.apply(...)` or `x["apply"](...)`. */
function spelledForwarder(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName();
  }
  const key = Node.isElementAccessExpression(callee) ? callee.getArgumentExpression() : undefined;
  return key !== undefined && Node.isStringLiteral(key) ? key.getLiteralValue() : undefined;
}

/**
 * The values an `apply`-style call spreads into its target's parameters: the elements of an array-literal argument.
 * Only `apply` and `Reflect.apply` spread; the array argument of any other call (a dependency list) is data.
 *
 * @remarks `forwarder` is the member name a caller already resolved through a checker or a const; without it the
 * call's spelled member is read.
 */
export function applyArgumentValues(
  call: CallExpression,
  argument: MorphNode | undefined,
  forwarder = spelledForwarder(call),
): readonly MorphNode[] | undefined {
  return forwarder === APPLY_FORWARDER && argument !== undefined && Node.isArrayLiteralExpression(argument) ? argument.getElements() : undefined;
}
