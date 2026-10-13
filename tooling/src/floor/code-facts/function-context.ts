// Native lexical function boundary shared by source readers.
import { Node, SyntaxKind } from "ts-morph";

function isFnish(n: Node): boolean {
  return (
    n.isKind(SyntaxKind.FunctionDeclaration) ||
    n.isKind(SyntaxKind.MethodDeclaration) ||
    n.isKind(SyntaxKind.ArrowFunction) ||
    n.isKind(SyntaxKind.FunctionExpression)
  );
}

/** The innermost enclosing function — the unit a post-fetch owner filter is resolved in. */
export function enclosingFn(node: Node): Node | undefined {
  return node.getFirstAncestor(isFnish);
}

/** Native body syntax observations for consumer-owned effect and rejection judgments. */
export function readFunctionBodyNodes(fn: Node): readonly Node[] {
  const body =
    Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn) || Node.isFunctionExpression(fn) || Node.isArrowFunction(fn) ? fn.getBody() : undefined;
  return body?.getDescendants() ?? [];
}
