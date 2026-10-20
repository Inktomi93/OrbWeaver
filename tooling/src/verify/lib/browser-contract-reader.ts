// The semantic reader for browser-only contracts consumed by Node-intent tests. It follows only module
// identity, declared alias/heritage ancestry, and generic constraints; it never expands object members or
// ReactNode's structural graph.

import { referenceResolutionServices } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { BROWSER_PACKAGES, worldOf } from "../../floor/compiler/project-worlds.ts";
import type { BrowserContractRead } from "../contract/browser-mount-native.ts";

export const BASE_UI_PREFIX = "@base-ui/react";
const REACT_DOM_ANCHORS = new Set(["DOMAttributes", "SyntheticEvent"]);
const BROWSER_PACKAGE_NAMES = [...BROWSER_PACKAGES].map((name) => RegExp.escape(name)).join("|");
export const BROWSER_PACKAGE_PATH_RE = new RegExp(`/packages/(?:${BROWSER_PACKAGE_NAMES})/src/`, "u");
const BROWSER_PACKAGE_SOURCE_RE = new RegExp(`/packages/(?:${BROWSER_PACKAGE_NAMES})/src/.*\\.tsx$`, "u");
export const BROWSER_PACKAGE_DOOR_RE = new RegExp(`^(?:@orb/(?:${BROWSER_PACKAGE_NAMES})(?:/|$)|.*packages/(?:${BROWSER_PACKAGE_NAMES})/src/)`, "u");
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
function callableAliasIssue(node: MorphNode, declarations: readonly MorphNode[], read: BrowserContractRead): BrowserContractIssue | undefined {
  const expressions = new Set(declarations.flatMap((declaration) => aliasExpressions(node, declaration)));
  const signatures = [...expressions].flatMap((expression) => {
    const selector = nodeTypeSelector(expression);
    return [...read.types.signatureDeclarations(selector, "call"), ...read.types.signatureDeclarations(selector, "construct")];
  });
  const implementation = browserPackageDeclaration(signatures);
  return implementation === undefined
    ? undefined
    : { kind: "browser-package", detail: `the callable implementation is authored by ${normalizedPath(implementation)}` };
}

function moduleIssue(node: MorphNode, read: BrowserContractRead): BrowserContractIssue | undefined {
  const origin = read.module(node);
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
    return callableAliasIssue(node, [...origin.trace.declarations, ...canonicalDeclarations(node, read)], read);
  }
  const tracedDeclarations = [...origin.trace.declarations, ...canonicalDeclarations(node, read)];
  const callable = callableAliasIssue(node, tracedDeclarations, read);
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
    const source = importDeclaration === undefined ? undefined : read.moduleSource(importDeclaration);
    return source !== undefined && BROWSER_PACKAGE_PATH_RE.test(source.getFilePath().replaceAll("\\", "/"));
  });
  return relevantDoor === undefined
    ? undefined
    : { kind: "unreadable", detail: `a relevant imported symbol has unresolved canonical origin (${origin.reason}: ${origin.detail})` };
}

function declarationName(node: MorphNode): string | undefined {
  return Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isClassDeclaration(node) ? node.getName() : undefined;
}

function canonicalDeclarations(reference: MorphNode, read: BrowserContractRead): readonly MorphNode[] {
  const symbol = read.types.symbol(reference);
  return symbol === null ? [] : read.types.symbolData(read.types.symbolData(symbol).canonical).declarations;
}

function isReactDeclaration(node: MorphNode): boolean {
  return normalizedPath(node).includes("/node_modules/@types/react/");
}

function intrinsicReferences(typeNode: TypeNode, read: BrowserContractRead): { readonly direct: boolean; readonly declarations: readonly MorphNode[] } {
  let reaches = false;
  const referencedDeclarations: MorphNode[] = [];
  if (Node.isTypeReference(typeNode)) {
    referencedDeclarations.push(...canonicalDeclarations(typeNode.getTypeName(), read));
  }
  typeNode.forEachDescendant((node, traversal) => {
    if (Node.isIdentifier(node) && node.getText() === "IntrinsicElements") {
      const declarations = canonicalDeclarations(node, read);
      if (declarations.length > 0 && declarations.every(isReactDeclaration)) {
        reaches = true;
        traversal.stop();
      }
      return;
    }
    if (Node.isTypeReference(node)) {
      referencedDeclarations.push(...canonicalDeclarations(node.getTypeName(), read));
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

function typeNodeReachesReactIntrinsic(typeNode: TypeNode, visited: Set<object>, read: BrowserContractRead): boolean {
  const references = intrinsicReferences(typeNode, read);
  if (references.direct) {
    return true;
  }
  return references.declarations.some((declaration) => {
    if (!isReactDeclaration(declaration) || visited.has(declaration.compilerNode)) {
      return false;
    }
    visited.add(declaration.compilerNode);
    return declarationConstraintBodies(declaration).some((body) => typeNodeReachesReactIntrinsic(body, visited, read));
  });
}

function constraintReachesReactIntrinsic(constraint: TypeNode | undefined, read: BrowserContractRead): boolean {
  if (constraint === undefined) {
    return false;
  }
  return typeNodeReachesReactIntrinsic(constraint, new Set<object>(), read);
}

function hasIntrinsicStringArgument(declaration: MorphNode, arguments_: readonly TypeNode[], read: BrowserContractRead): boolean {
  if (!(Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration) || Node.isClassDeclaration(declaration))) {
    return false;
  }
  return declaration.getTypeParameters().some((parameter, index) => {
    const argument = arguments_[index];
    return (
      argument !== undefined &&
      constraintReachesReactIntrinsic(parameter.getConstraint(), read) &&
      hasStringLiteralConstituent(nodeTypeSelector(argument), read)
    );
  });
}

function hasStringLiteralConstituent(type: NativeTypeSelector, read: BrowserContractRead): boolean {
  const pending = [type];
  const seen = new Set<object>();
  for (const current of pending) {
    const selected = read.types.select(current);
    if (selected === null) {
      continue;
    }
    const metadata = read.types.type(selected);
    if (seen.has(metadata.key)) {
      continue;
    }
    seen.add(metadata.key);
    if (read.types.primitiveFlags(current).stringLiteral) {
      return true;
    }
    pending.push(...read.types.unions(current), ...read.types.intersections(current));
    const constraint = read.types.constraint(current);
    if (constraint !== null) {
      pending.push(constraint);
    }
  }
  return false;
}

function fallbackIssue(declarations: readonly MorphNode[]): BrowserContractIssue | undefined {
  if (!declarations.some((declaration) => normalizedPath(declaration).endsWith("/node_modules/@types/react/global.d.ts"))) {
    return;
  }
  const meaningful = declarations.filter(
    (declaration) =>
      !(normalizedPath(declaration).endsWith("/node_modules/@types/react/global.d.ts") || TYPESCRIPT_BROWSER_LIB_RE.test(normalizedPath(declaration))),
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

function directTypeIssue(declarations: readonly MorphNode[], arguments_: readonly TypeNode[], read: BrowserContractRead): BrowserContractIssue | undefined {
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
  const intrinsic = declarations.some((declaration) => isReactDeclaration(declaration) && hasIntrinsicStringArgument(declaration, arguments_, read));
  return intrinsic
    ? { kind: "react-dom", detail: "a string intrinsic is supplied to a canonical React generic constrained by JSX.IntrinsicElements" }
    : undefined;
}

function nestedArgumentIssue(arguments_: readonly TypeNode[], visited: Set<object>, read: BrowserContractRead): BrowserContractIssue | undefined {
  let found: BrowserContractIssue | undefined;
  for (const argument of arguments_) {
    const nested = typeUse(argument);
    const issue = nested === undefined ? undefined : inspectTypeUse(nested, visited, read);
    if (issue !== undefined) {
      found = issue;
      break;
    }
  }
  return found;
}

function ancestryIssue(declarations: readonly MorphNode[], visited: Set<object>, read: BrowserContractRead): BrowserContractIssue | undefined {
  let found: BrowserContractIssue | undefined;
  for (const declaration of declarations) {
    if (visited.has(declaration.compilerNode)) {
      continue;
    }
    visited.add(declaration.compilerNode);
    for (const parent of declarationParents(declaration)) {
      const issue = inspectTypeUse(parent, visited, read);
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

function inspectTypeUse(use: TypeUse, visited: Set<object>, read: BrowserContractRead): BrowserContractIssue | undefined {
  const declarations = canonicalDeclarations(use.reference, read);
  if (declarations.length === 0) {
    return moduleIssue(use.reference, read);
  }
  return directTypeIssue(declarations, use.arguments, read) ?? nestedArgumentIssue(use.arguments, visited, read) ?? ancestryIssue(declarations, visited, read);
}

/** Inspect one consumed module reference or type use. The caller supplies only dispatcher-delivered nodes. */
export function browserContractIssue(node: MorphNode, read: BrowserContractRead): BrowserContractIssue | undefined {
  const use = typeUse(node);
  return use === undefined ? moduleIssue(node, read) : inspectTypeUse(use, new Set<object>(), read);
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
