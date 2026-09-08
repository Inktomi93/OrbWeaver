// The semantic reader for browser-only contracts consumed by Node-intent tests. It follows only module
// identity, declared alias/heritage ancestry, and generic constraints; it never expands object members or
// ReactNode's structural graph.
import type { Node as MorphNode, Type, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { BROWSER_PACKAGES, worldOf } from "../../_shared/project-worlds.ts";
import { referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";

const BASE_UI_PREFIX = "@base-ui/react";
const REACT_DOM_ANCHORS = new Set(["DOMAttributes", "SyntheticEvent"]);
const BROWSER_PACKAGE_NAMES = [...BROWSER_PACKAGES].map((name) => RegExp.escape(name)).join("|");
const BROWSER_PACKAGE_PATH_RE = new RegExp(`/packages/(?:${BROWSER_PACKAGE_NAMES})/src/`, "u");
const BROWSER_PACKAGE_SOURCE_RE = new RegExp(`/packages/(?:${BROWSER_PACKAGE_NAMES})/src/.*\\.tsx$`, "u");
const BROWSER_PACKAGE_DOOR_RE = new RegExp(`^(?:@orb/(?:${BROWSER_PACKAGE_NAMES})(?:/|$)|.*packages/(?:${BROWSER_PACKAGE_NAMES})/src/)`, "u");
const REACT_GLOBAL_RE = /\/node_modules\/@types\/react\/global\.d\.ts$/u;
const REACT_TYPES_RE = /\/node_modules\/@types\/react\//u;
const TYPESCRIPT_BROWSER_LIB_RE = /\/node_modules\/typescript\/lib\/lib\.(?:dom|webworker)(?:\.[^/]+)?\.d\.ts$/u;

export interface BrowserContractIssue {
  readonly kind: "browser-package" | "base-ui" | "react-dom" | "react-global-fallback" | "unreadable";
  readonly detail: string;
}

function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

/** Exactly the roots compiled with Node intent. Browser suffixes, CT, E2E, stories, and incidental TSX are excluded. */
export function isNodeTestContractRoot(rel: string): boolean {
  const world = worldOf(rel);
  return rel.startsWith("tests/") && (world === "node" || world === "iso");
}

function browserPackageDeclaration(declarations: readonly MorphNode[]): MorphNode | undefined {
  return declarations.find(
    (declaration) =>
      BROWSER_PACKAGE_SOURCE_RE.test(normalizedPath(declaration)) &&
      !Node.isPropertySignature(declaration) &&
      !Node.isPropertyAssignment(declaration) &&
      !Node.isShorthandPropertyAssignment(declaration) &&
      !Node.isParameterDeclaration(declaration),
  );
}

function aliasExpressions(node: MorphNode, declaration: MorphNode): readonly MorphNode[] {
  if (declaration.getSourceFile().isDeclarationFile()) {
    return [];
  }
  if (Node.isBindingElement(declaration) || Node.isParameterDeclaration(declaration)) {
    return [node];
  }
  if (!(Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration))) {
    return [];
  }
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    return [];
  }
  const value = referenceResolutionServices.unwrapExpression(initializer);
  return Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value) || Node.isObjectLiteralExpression(value)
    ? [node, value]
    : [];
}

/** Public const facades retain their own export identity; callable signatures still identify the implementation. */
function callableAliasIssue(node: MorphNode, declarations: readonly MorphNode[]): BrowserContractIssue | undefined {
  const expressions = new Set(declarations.flatMap((declaration) => aliasExpressions(node, declaration)));
  const signatures = [...expressions].flatMap((expression) => {
    const type = expression.getType();
    return [...type.getCallSignatures(), ...type.getConstructSignatures()];
  });
  const implementation = browserPackageDeclaration(signatures.map((signature) => signature.getDeclaration()));
  return implementation === undefined
    ? undefined
    : { kind: "browser-package", detail: `the callable implementation is authored by ${normalizedPath(implementation)}` };
}

function moduleIssue(node: MorphNode): BrowserContractIssue | undefined {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "resolved") {
    if (origin.value.moduleSpecifier === BASE_UI_PREFIX || origin.value.moduleSpecifier.startsWith(`${BASE_UI_PREFIX}/`)) {
      return { kind: "base-ui", detail: `the consumed symbol resolves through ${origin.value.moduleSpecifier}` };
    }
    if (origin.value.canonical.kind === "external-door" && BROWSER_PACKAGE_DOOR_RE.test(origin.value.moduleSpecifier)) {
      return { kind: "unreadable", detail: `the browser-package door ${origin.value.moduleSpecifier} has no canonical authored target` };
    }
    if (origin.value.canonical.kind === "project" && BROWSER_PACKAGE_SOURCE_RE.test(normalizedPath(origin.value.canonical.declaration))) {
      return {
        kind: "browser-package",
        detail: `the consumed symbol is authored by ${normalizedPath(origin.value.canonical.declaration)}`,
      };
    }
    return callableAliasIssue(node, [...origin.trace.declarations, ...canonicalDeclarations(node)]);
  }
  const tracedDeclarations = [...origin.trace.declarations, ...canonicalDeclarations(node)];
  const callable = callableAliasIssue(node, tracedDeclarations);
  if (callable !== undefined) {
    return callable;
  }
  const tracedBrowserPackage = tracedDeclarations.filter((declaration) => BROWSER_PACKAGE_PATH_RE.test(normalizedPath(declaration)));
  const tracedBrowserAuthored = browserPackageDeclaration(tracedBrowserPackage);
  if (tracedBrowserAuthored !== undefined) {
    return { kind: "browser-package", detail: `the consumed symbol is authored by ${normalizedPath(tracedBrowserAuthored)}` };
  }
  if (origin.reason === "unsupported" && tracedBrowserPackage.length > 0) {
    return;
  }
  const relevantDoor = origin.trace.declarations.find((declaration) => {
    const importDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    const specifier = importDeclaration?.getModuleSpecifierValue();
    if (specifier === BASE_UI_PREFIX || specifier?.startsWith(`${BASE_UI_PREFIX}/`) === true) {
      return true;
    }
    if (specifier !== undefined && BROWSER_PACKAGE_DOOR_RE.test(specifier)) {
      return true;
    }
    const source = importDeclaration?.getModuleSpecifierSourceFile();
    return source !== undefined && BROWSER_PACKAGE_PATH_RE.test(source.getFilePath().replaceAll("\\", "/"));
  });
  return relevantDoor === undefined
    ? undefined
    : { kind: "unreadable", detail: `a relevant imported symbol has unresolved canonical origin (${origin.reason}: ${origin.detail})` };
}

function declarationName(node: MorphNode): string | undefined {
  return Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isClassDeclaration(node) ? node.getName() : undefined;
}

function canonicalDeclarations(reference: MorphNode): readonly MorphNode[] {
  const symbol = reference.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

function isReactDeclaration(node: MorphNode): boolean {
  return REACT_TYPES_RE.test(normalizedPath(node));
}

function intrinsicReferences(typeNode: TypeNode): { readonly direct: boolean; readonly declarations: readonly MorphNode[] } {
  let reaches = false;
  const referencedDeclarations: MorphNode[] = [];
  if (Node.isTypeReference(typeNode)) {
    referencedDeclarations.push(...canonicalDeclarations(typeNode.getTypeName()));
  }
  typeNode.forEachDescendant((node, traversal) => {
    if (Node.isIdentifier(node) && node.getText() === "IntrinsicElements") {
      const declarations = canonicalDeclarations(node);
      if (declarations.length > 0 && declarations.every(isReactDeclaration)) {
        reaches = true;
        traversal.stop();
      }
      return;
    }
    if (Node.isTypeReference(node)) {
      referencedDeclarations.push(...canonicalDeclarations(node.getTypeName()));
    }
  });
  return { direct: reaches, declarations: referencedDeclarations };
}

function declarationConstraintBodies(declaration: MorphNode): readonly TypeNode[] {
  const bodies: TypeNode[] = [];
  if (Node.isTypeAliasDeclaration(declaration)) {
    const body = declaration.getTypeNode();
    if (body !== undefined) {
      bodies.push(body);
    }
  }
  if (Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration) || Node.isClassDeclaration(declaration)) {
    for (const parameter of declaration.getTypeParameters()) {
      const constraint = parameter.getConstraint();
      const defaultType = parameter.getDefault();
      if (constraint !== undefined) {
        bodies.push(constraint);
      }
      if (defaultType !== undefined) {
        bodies.push(defaultType);
      }
    }
  }
  return bodies;
}

function typeNodeReachesReactIntrinsic(typeNode: TypeNode, visited: Set<object>): boolean {
  const references = intrinsicReferences(typeNode);
  if (references.direct) {
    return true;
  }
  return references.declarations.some((declaration) => {
    if (!isReactDeclaration(declaration) || visited.has(declaration.compilerNode)) {
      return false;
    }
    visited.add(declaration.compilerNode);
    return declarationConstraintBodies(declaration).some((body) => typeNodeReachesReactIntrinsic(body, visited));
  });
}

function constraintReachesReactIntrinsic(constraint: TypeNode | undefined): boolean {
  if (constraint === undefined) {
    return false;
  }
  return typeNodeReachesReactIntrinsic(constraint, new Set<object>());
}

function hasIntrinsicStringArgument(declaration: MorphNode, arguments_: readonly TypeNode[]): boolean {
  if (!(Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration) || Node.isClassDeclaration(declaration))) {
    return false;
  }
  return declaration.getTypeParameters().some((parameter, index) => {
    const argument = arguments_[index];
    return argument !== undefined && constraintReachesReactIntrinsic(parameter.getConstraint()) && hasStringLiteralConstituent(argument.getType());
  });
}

function hasStringLiteralConstituent(type: Type): boolean {
  const pending = [type];
  const seen = new Set<object>();
  for (const current of pending) {
    if (seen.has(current.compilerType)) {
      continue;
    }
    seen.add(current.compilerType);
    if (current.isStringLiteral()) {
      return true;
    }
    pending.push(...current.getUnionTypes(), ...current.getIntersectionTypes());
    const constraint = current.getConstraint();
    if (constraint !== undefined) {
      pending.push(constraint);
    }
  }
  return false;
}

function fallbackIssue(declarations: readonly MorphNode[]): BrowserContractIssue | undefined {
  if (!declarations.some((declaration) => REACT_GLOBAL_RE.test(normalizedPath(declaration)))) {
    return;
  }
  const meaningful = declarations.filter(
    (declaration) => !(REACT_GLOBAL_RE.test(normalizedPath(declaration)) || TYPESCRIPT_BROWSER_LIB_RE.test(normalizedPath(declaration))),
  );
  return meaningful.length === 0
    ? { kind: "react-global-fallback", detail: "the type exists in the Node world only as React's empty global.d.ts fallback" }
    : undefined;
}

interface TypeUse {
  readonly reference: MorphNode;
  readonly arguments: readonly TypeNode[];
}

function typeUse(node: MorphNode): TypeUse | undefined {
  if (Node.isTypeReference(node)) {
    return { reference: node.getTypeName(), arguments: node.getTypeArguments() };
  }
  return Node.isExpressionWithTypeArguments(node) ? { reference: node.getExpression(), arguments: node.getTypeArguments() } : undefined;
}

function directAliasUses(typeNode: TypeNode): readonly TypeUse[] {
  if (Node.isParenthesizedTypeNode(typeNode)) {
    return directAliasUses(typeNode.getTypeNode());
  }
  if (Node.isIntersectionTypeNode(typeNode) || Node.isUnionTypeNode(typeNode)) {
    return typeNode.getTypeNodes().flatMap(directAliasUses);
  }
  const use = typeUse(typeNode);
  return use === undefined ? [] : [use];
}

function directTypeIssue(declarations: readonly MorphNode[], arguments_: readonly TypeNode[]): BrowserContractIssue | undefined {
  const browserDeclaration = browserPackageDeclaration(declarations);
  if (browserDeclaration !== undefined) {
    return { kind: "browser-package", detail: `the consumed type is authored by ${normalizedPath(browserDeclaration)}` };
  }
  const fallback = fallbackIssue(declarations);
  if (fallback !== undefined) {
    return fallback;
  }
  const anchor = declarations.find((declaration) => isReactDeclaration(declaration) && REACT_DOM_ANCHORS.has(declarationName(declaration) ?? ""));
  if (anchor !== undefined) {
    return { kind: "react-dom", detail: `the type derives from React.${declarationName(anchor)}` };
  }
  const intrinsic = declarations.some((declaration) => isReactDeclaration(declaration) && hasIntrinsicStringArgument(declaration, arguments_));
  return intrinsic
    ? { kind: "react-dom", detail: "a string intrinsic is supplied to a canonical React generic constrained by JSX.IntrinsicElements" }
    : undefined;
}

function nestedArgumentIssue(arguments_: readonly TypeNode[], visited: Set<object>): BrowserContractIssue | undefined {
  let found: BrowserContractIssue | undefined;
  for (const argument of arguments_) {
    const nested = typeUse(argument);
    const issue = nested === undefined ? undefined : inspectTypeUse(nested, visited);
    if (issue !== undefined) {
      found = issue;
      break;
    }
  }
  return found;
}

function ancestryIssue(declarations: readonly MorphNode[], visited: Set<object>): BrowserContractIssue | undefined {
  let found: BrowserContractIssue | undefined;
  for (const declaration of declarations) {
    if (visited.has(declaration.compilerNode)) {
      continue;
    }
    visited.add(declaration.compilerNode);
    for (const parent of declarationParents(declaration)) {
      const issue = inspectTypeUse(parent, visited);
      if (issue !== undefined) {
        found = issue;
        break;
      }
    }
    if (found !== undefined) {
      break;
    }
  }
  return found;
}

function declarationParents(declaration: MorphNode): readonly TypeUse[] {
  if (Node.isTypeAliasDeclaration(declaration)) {
    const typeNode = declaration.getTypeNode();
    return typeNode === undefined ? [] : directAliasUses(typeNode);
  }
  if (Node.isInterfaceDeclaration(declaration) || Node.isClassDeclaration(declaration)) {
    return declaration
      .getHeritageClauses()
      .flatMap((clause) => clause.getTypeNodes())
      .map((heritage) => ({ reference: heritage.getExpression(), arguments: heritage.getTypeArguments() }));
  }
  return [];
}

function inspectTypeUse(use: TypeUse, visited: Set<object>): BrowserContractIssue | undefined {
  const declarations = canonicalDeclarations(use.reference);
  if (declarations.length === 0) {
    return moduleIssue(use.reference);
  }
  return directTypeIssue(declarations, use.arguments) ?? nestedArgumentIssue(use.arguments, visited) ?? ancestryIssue(declarations, visited);
}

/** Inspect one consumed module reference or type use. The caller supplies only dispatcher-delivered nodes. */
export function browserContractIssue(node: MorphNode): BrowserContractIssue | undefined {
  const use = typeUse(node);
  return use === undefined ? moduleIssue(node) : inspectTypeUse(use, new Set<object>());
}

/** A direct Base UI import is itself a forbidden browser door, even when the binding is accidentally unused. */
export function directBaseUiDoor(node: MorphNode): BrowserContractIssue | undefined {
  if (!Node.isImportDeclaration(node)) {
    return;
  }
  const specifier = node.getModuleSpecifierValue();
  return specifier === BASE_UI_PREFIX || specifier.startsWith(`${BASE_UI_PREFIX}/`)
    ? { kind: "base-ui", detail: `the Node-intent root imports the browser-only ${specifier} door directly` }
    : undefined;
}

function relevantModuleBindings(node: MorphNode, candidateBindingsBySource: WeakMap<object, ReadonlySet<string>>): ReadonlySet<string> {
  const source = node.getSourceFile();
  const cached = candidateBindingsBySource.get(source.compilerNode);
  if (cached !== undefined) {
    return cached;
  }
  const names = new Set<string>();
  for (const declaration of source.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const importedSource = declaration.getModuleSpecifierSourceFile();
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
export function isPotentialModuleReference(node: MorphNode, candidateBindingsBySource: WeakMap<object, ReadonlySet<string>>): boolean {
  const root = referenceRoot(node);
  if (root === undefined) {
    return false;
  }
  const bindings = relevantModuleBindings(node, candidateBindingsBySource);
  if (bindings.has(root.getText())) {
    return true;
  }
  return (
    bindings.size > 0 &&
    (root.getSymbol()?.getDeclarations() ?? []).some(
      (declaration) => Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration) || Node.isParameterDeclaration(declaration),
    )
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
