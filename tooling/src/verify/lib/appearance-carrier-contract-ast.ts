import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

function unwrap(node: Node): Node {
  let current = node;
  while (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** Read an object-map's literal keys without evaluating the module under verification. */
export function literalObjectKeys(source: SourceFile, symbol: string): ReadonlySet<string> {
  const initializer = source.getVariableDeclaration(symbol)?.getInitializer();
  const object = initializer === undefined ? undefined : unwrap(initializer);
  if (object === undefined || !Node.isObjectLiteralExpression(object)) {
    return new Set<string>();
  }
  return new Set(
    object
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((property) => property.getNameNode().getText().replaceAll('"', "").replaceAll("'", "")),
  );
}

/** True when a visited property belongs to the named top-level object declaration. */
export function belongsToObjectDeclaration(node: Node, symbol: string): boolean {
  return Node.isPropertyAssignment(node) && node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() === symbol;
}
