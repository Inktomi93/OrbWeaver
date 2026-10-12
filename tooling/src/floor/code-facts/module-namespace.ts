// Whether an expression is the namespace object of an authored module (`import * as m`, `await import(…)`), read
// off the declaration its type names. A third-party package or a lib declaration file is not authored source.
import type { Node } from "ts-morph";
import { Node as N } from "ts-morph";

export function isAuthoredModuleNamespace(expression: Node): boolean {
  const declarations = expression.getType().getSymbol()?.getDeclarations() ?? [];
  return declarations.some((declaration) => N.isSourceFile(declaration) && !declaration.isInNodeModules() && !declaration.isDeclarationFile());
}
