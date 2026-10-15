// Whether an expression is the namespace object of an authored module (`import * as m`, `await import(…)`), read
// off the declaration its type names. A third-party package or a lib declaration file is not authored source.
import type { Node } from "ts-morph";
import { Node as N } from "ts-morph";

export function isAuthoredModuleNamespace(expression: Node): boolean {
  const declarations = readModuleNamespaceDeclarations(expression);
  return hasAuthoredModuleNamespaceDeclaration(declarations);
}

/** Captured native type-symbol declarations retain the original namespace judgment. */
export function hasAuthoredModuleNamespaceDeclaration(declarations: readonly Node[]): boolean {
  return declarations.some((declaration) => N.isSourceFile(declaration) && !declaration.isInNodeModules() && !declaration.isDeclarationFile());
}

/** Complete native type-symbol declarations; namespace policy remains a separate judgment. */
export function readModuleNamespaceDeclarations(expression: Node): readonly Node[] {
  return expression.getType().getSymbol()?.getDeclarations() ?? [];
}
