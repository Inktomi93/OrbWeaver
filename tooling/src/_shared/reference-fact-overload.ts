// Single-home recognition for module-level function overload sets.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

const OVERLOAD_DECLARATION_KINDS: ReadonlySet<SyntaxKind> = new Set<SyntaxKind>([SyntaxKind.FunctionDeclaration]);

function isOverloadImplementation(declaration: MorphNode): boolean {
  return Node.isFunctionDeclaration(declaration) && declaration.getBody() !== undefined;
}

/** ONE identity home for a same-file function overload set. Mixed kinds, multiple files, and duplicate
 *  implementations remain ambiguous. Module exports and module-local callables share this identity rule. */
export function overloadHome(declarations: readonly MorphNode[]): MorphNode | undefined {
  const first = declarations[0];
  if (first === undefined || declarations.length < 2 || !OVERLOAD_DECLARATION_KINDS.has(first.getKind())) {
    return;
  }
  const kind = first.getKind();
  const sourceFile = first.getSourceFile().compilerNode;
  if (!declarations.every((declaration) => declaration.getKind() === kind && declaration.getSourceFile().compilerNode === sourceFile)) {
    return;
  }
  const implementations = declarations.filter(isOverloadImplementation);
  return implementations.length > 1 ? undefined : (implementations[0] ?? first);
}
