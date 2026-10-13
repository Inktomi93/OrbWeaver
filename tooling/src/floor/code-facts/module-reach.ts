// Module closure and authored test syntax retain caller-specific admission without module resolution.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind, ts } from "ts-morph";

import { resolveRelativeImport } from "./module-specifier.ts";

const SUBJECT_RE = /@subject[\t ]+(\S+)/gu;
/** The root `package.json` imports map: `#<package>/<path>` is `packages/<package>/src/<path>`. */
const SUBPATH_IMPORT_RE = /^#([a-z][a-z-]*)\/(.+)$/u;

/** Every path reachable from `starts` through the caller's admitted target edges. */
export function moduleClosure(starts: readonly string[], targetsOf: (path: string) => readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...starts];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || reached.has(path)) {
      continue;
    }
    reached.add(path);
    pending.push(...targetsOf(path));
  }
  return reached;
}

/** The `@subject` paths in a file's leading comment block. */
export function subjectHeader(sourceFile: SourceFile): readonly string[] {
  const text = sourceFile.getFullText();
  const out: string[] = [];
  for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) {
    for (const match of text.slice(range.pos, range.end).matchAll(SUBJECT_RE)) {
      const path = match[1];
      if (path !== undefined) {
        out.push(path);
      }
    }
  }
  return out;
}

export function isTypeDeclaration(declaration: MorphNode): boolean {
  return Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration) || Node.isTypeParameterDeclaration(declaration);
}

/** Candidate call bindings only; the module-origin reader proves whether an import or local alias is real. */
export function moduleValueCandidateNames(file: SourceFile): ReadonlySet<string> {
  const values = new Set<string>();
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.isTypeOnly()) {
      continue;
    }
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport !== undefined) {
      values.add(defaultImport.getText());
    }
    for (const specifier of declaration.getNamedImports()) {
      if (!specifier.isTypeOnly()) {
        values.add((specifier.getAliasNode() ?? specifier.getNameNode()).getText());
      }
    }
  }
  for (const name of file.getDescendantsOfKind(SyntaxKind.VariableDeclaration).flatMap(variableBindingNames)) {
    values.add(name);
  }
  return values;
}

function variableBindingNames(declaration: import("ts-morph").VariableDeclaration): readonly string[] {
  const name = declaration.getNameNode();
  if (Node.isIdentifier(name)) {
    return [name.getText()];
  }
  return Node.isObjectBindingPattern(name)
    ? name
        .getElements()
        .map((element) => element.getNameNode())
        .filter(Node.isIdentifier)
        .map((binding) => binding.getText())
    : [];
}

export function namespaceMembers(file: SourceFile, local: string): readonly string[] {
  return file
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((access) => access.getExpression().getText() === local)
    .map((access) => access.getName());
}

/** `const { a, b: c } = await import("x")` names `a` and `b`. */
export function destructuredNames(call: MorphNode): readonly string[] {
  const holder = call.getParentWhile((parent) => Node.isAwaitExpression(parent) || Node.isParenthesizedExpression(parent)) ?? call;
  const declaration = holder.getParent();
  if (declaration === undefined || !Node.isVariableDeclaration(declaration)) {
    return [];
  }
  const binding = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(binding)) {
    return [];
  }
  return binding.getElements().map((element) => (element.getPropertyNameNode() ?? element.getNameNode()).getText());
}

/** A repo-relative path for a relative or `#<package>/` specifier; `undefined` for a bare package name. */
export function specifierPath(from: string, specifier: string): string | undefined {
  if (specifier.startsWith(".")) {
    return resolveRelativeImport(from, specifier) ?? undefined;
  }
  const subpath = SUBPATH_IMPORT_RE.exec(specifier);
  return subpath === null ? undefined : `packages/${subpath[1] ?? ""}/src/${subpath[2] ?? ""}`;
}
