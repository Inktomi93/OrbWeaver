// Cheap syntactic nomination for the browser-contract reader: which references in a Node-intent root bind a
// browser door at all. Nomination only admits a reference to the semantic read; it never decides an issue.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { BrowserContractRead } from "../contract/browser-mount-native.ts";
import { BASE_UI_PREFIX, BROWSER_PACKAGE_DOOR_RE, BROWSER_PACKAGE_PATH_RE } from "./browser-contract-reader.ts";

function relevantModuleBindings(
  node: MorphNode,
  candidateBindingsBySource: WeakMap<object, ReadonlySet<string>>,
  read: BrowserContractRead,
): ReadonlySet<string> {
  const source = node.getSourceFile();
  const cached = candidateBindingsBySource.get(source.compilerNode);
  if (cached !== undefined) {
    return cached;
  }
  const names = new Set<string>();
  for (const declaration of source.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const importedSource = read.moduleSource(declaration);
    const importedPath = importedSource?.getFilePath().replaceAll("\\", "/");
    if (
      !(specifier === BASE_UI_PREFIX || specifier.startsWith(`${BASE_UI_PREFIX}/`) || BROWSER_PACKAGE_DOOR_RE.test(specifier)) &&
      (importedPath === undefined || !BROWSER_PACKAGE_PATH_RE.test(importedPath))
    ) {
      continue;
    }
    const defaultImport = declaration.getDefaultImport();
    const namespaceImport = declaration.getNamespaceImport();
    if (defaultImport !== undefined) {
      names.add(defaultImport.getText());
    }
    if (namespaceImport !== undefined) {
      names.add(namespaceImport.getText());
    }
    for (const named of declaration.getNamedImports()) {
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  candidateBindingsBySource.set(source.compilerNode, names);
  return names;
}

function referenceRoot(node: MorphNode): import("ts-morph").Identifier | undefined {
  let current = node;
  while (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
    current = current.getExpression();
  }
  return Node.isIdentifier(current) ? current : undefined;
}

/** Cheap authored-door nomination before the canonical resolver. False positives are judged semantically. */
export function isPotentialModuleReference(
  node: MorphNode,
  candidateBindingsBySource: WeakMap<object, ReadonlySet<string>>,
  read: BrowserContractRead,
): boolean {
  const root = referenceRoot(node);
  if (root === undefined) {
    return false;
  }
  const bindings = relevantModuleBindings(node, candidateBindingsBySource, read);
  if (bindings.has(root.getText())) {
    return true;
  }
  if (bindings.size === 0) {
    return false;
  }
  const symbol = read.types.symbol(root);
  return (symbol === null ? [] : read.types.symbolData(symbol).declarations).some(
    (declaration) => Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration) || Node.isParameterDeclaration(declaration),
  );
}

/** Declaration/name positions do not consume imported bindings. */
export function isConsumedReference(node: MorphNode): boolean {
  if (!(Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return false;
  }
  const parent = node.getParent();
  if (
    Node.isImportSpecifier(parent) ||
    Node.isImportClause(parent) ||
    Node.isNamespaceImport(parent) ||
    Node.isExportSpecifier(parent) ||
    Node.isImportDeclaration(parent)
  ) {
    return false;
  }
  if (Node.isQualifiedName(parent)) {
    return false;
  }
  if ((Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === node) {
    return false;
  }
  return true;
}
