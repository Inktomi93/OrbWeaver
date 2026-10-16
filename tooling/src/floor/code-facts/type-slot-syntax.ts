// The canonical authored slot grammar: transparent wrappers, own returns and nested aggregate argument paths.
import type { Expression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
export function unwrapTypeExpression(node: Expression): Expression {
  let current = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isNonNullExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function contextualPropertyInitializer(node: import("ts-morph").PropertyAssignment): readonly Expression[] {
  const initializer = node.getInitializer();
  return initializer === undefined ? [] : [initializer];
}

export function contextualExpressions(node: MorphNode): readonly Expression[] {
  if (Node.isPropertyAssignment(node)) {
    return contextualPropertyInitializer(node);
  }
  if (Node.isReturnStatement(node)) {
    const expression = node.getExpression();
    return expression === undefined ? [] : [expression];
  }
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    return Node.isExpression(body) ? [body] : [];
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().filter((element): element is Expression => Node.isExpression(element) && !Node.isSpreadElement(element));
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
    return [node.getRight()];
  }
  return [];
}

export type AggregatePathSegment = { readonly kind: "property"; readonly name: string } | { readonly kind: "index"; readonly index: number };

export interface AggregateCallPath {
  readonly call: import("ts-morph").CallExpression;
  readonly argument: import("ts-morph").ObjectLiteralExpression | import("ts-morph").ArrayLiteralExpression;
  readonly segments: readonly AggregatePathSegment[];
}

function enclosingAggregate(
  current: AggregateCallPath["argument"],
): { readonly argument: AggregateCallPath["argument"]; readonly segment: AggregatePathSegment } | undefined {
  const parent = current.getParent();
  if (Node.isPropertyAssignment(parent)) {
    const argument = parent.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
    return argument === undefined ? undefined : { argument, segment: { kind: "property", name: parent.getName() } };
  }
  if (!Node.isArrayLiteralExpression(parent)) {
    return;
  }
  const index = parent.getElements().indexOf(current);
  return index < 0 ? undefined : { argument: parent, segment: { kind: "index", index } };
}

export function aggregateCallPath(node: MorphNode, expression: Expression): AggregateCallPath | undefined {
  const segments: AggregatePathSegment[] = [];
  let aggregate: import("ts-morph").ObjectLiteralExpression | import("ts-morph").ArrayLiteralExpression | undefined;
  if (Node.isPropertyAssignment(node)) {
    aggregate = node.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
    segments.unshift({ kind: "property", name: node.getName() });
  } else if (Node.isArrayLiteralExpression(node)) {
    aggregate = node;
    const index = node.getElements().indexOf(expression);
    if (index < 0) {
      return;
    }
    segments.unshift({ kind: "index", index });
  }
  if (aggregate === undefined) {
    return;
  }

  let current: import("ts-morph").ObjectLiteralExpression | import("ts-morph").ArrayLiteralExpression = aggregate;
  for (;;) {
    const parent: MorphNode | undefined = current.getParent();
    if (Node.isCallExpression(parent)) {
      return { call: parent, argument: current, segments };
    }
    const outer = enclosingAggregate(current);
    if (outer !== undefined) {
      segments.unshift(outer.segment);
      current = outer.argument;
      continue;
    }
    return;
  }
}

/** The expressions a function-like node returns from ITS OWN body: an expression body is its single return,
 *  and a nested function's returns are excluded. The family's schema-factory reader classifies these. */
export function ownReturnExpressions(node: MorphNode): readonly Expression[] {
  if (!(Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node))) {
    return [];
  }
  const body = node.getBody();
  if (body === undefined) {
    return [];
  }
  if (Node.isExpression(body)) {
    return [body];
  }
  return body
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((statement) => statement.getFirstAncestor(Node.isFunctionLikeDeclaration) === node)
    .flatMap((statement) => {
      const expression = statement.getExpression();
      return expression === undefined ? [] : [expression];
    });
}
