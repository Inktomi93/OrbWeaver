import type { CallExpression, Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";

/** Calls made as top-level expression statements, including top-level awaited calls. */
export function moduleScopeCalls(sourceFile: SourceFile): readonly CallExpression[] {
  const out: CallExpression[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.getExpression();
    const call = Node.isAwaitExpression(expression) ? expression.getExpression() : expression;
    if (Node.isCallExpression(call)) {
      out.push(call);
    }
  }
  return out;
}

export function moduleScopeCallees(sourceFile: SourceFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const call of moduleScopeCalls(sourceFile)) {
    const callee = call.getExpression();
    if (Node.isIdentifier(callee)) {
      out.add(callee.getText());
    }
  }
  return out;
}

/** The sole exported function declaration, or undefined when the module cannot identify one unambiguously. */
export function soleExportedFunction(project: Project, path: string): string | undefined {
  const sourceFile = project.getSourceFile(path);
  if (sourceFile === undefined) {
    return;
  }
  const names = sourceFile
    .getFunctions()
    .filter((fn) => fn.isExported())
    .map((fn) => fn.getName())
    .filter((name): name is string => name !== undefined);
  return names.length === 1 ? names[0] : undefined;
}
