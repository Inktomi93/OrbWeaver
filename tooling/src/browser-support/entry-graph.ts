// The files a script runs before anything it dynamically imports: the entry and its static relative imports, followed transitively.
// A dynamic `import()` is not followed, which is the point: it is the boundary the polyfill entry waits on.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

function staticSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  return source.statements.flatMap((statement) => {
    const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
    return specifier !== undefined && ts.isStringLiteral(specifier) && specifier.text.startsWith(".") ? [specifier.text] : [];
  });
}

/** Absolute paths of `entry` and every file it reaches through static relative imports. */
export function staticImportGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    for (const specifier of staticSpecifiers(file)) {
      visit(resolve(dirname(file), specifier));
    }
  };
  visit(entry);
  return [...seen];
}
