import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

/** Null is a non-exported subject; unknown is exact and never unwraps a Promise or an input type. */
export function readDeclarationOutput(node: MorphNode): boolean | null {
  if (Node.isFunctionDeclaration(node)) {
    return node.isExported() ? node.getReturnType().isUnknown() : null;
  }
  if (!Node.isVariableDeclaration(node)) {
    throw new Error("native declaration output requires a function or variable declaration");
  }
  if (node.getVariableStatement()?.isExported() !== true) {
    return null;
  }
  const initializer = node.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ? initializer.getReturnType().isUnknown()
    : node.getType().isUnknown();
}
