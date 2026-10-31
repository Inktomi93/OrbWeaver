// Engine one's reference index: every name in a world's files resolved to the declarations it means, in a few batched
// checker passes. A site the checker gives its own symbol (an object literal key, a shorthand binding) resolves
// through its literal's contextual type or its pattern's type, the way find-references links them.
import type { ClassDeclaration, ClassExpression, Expression, Identifier, Node, NoSubstitutionTemplateLiteral, StringLiteral } from "@typescript/native/ast";
import {
  isBindingElement,
  isClassDeclaration,
  isClassExpression,
  isElementAccessExpression,
  isExpressionWithTypeArguments,
  isGetAccessorDeclaration,
  isIdentifier,
  isJsxAttribute,
  isJsxAttributes,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeQueryNode,
  isTypeReferenceNode,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys } from "./native.ts";

/** Declaration key to the sites that resolve to it. */
export type ReferenceIndex = ReadonlyMap<string, readonly Site[]>;

function credit(index: Map<string, Site[]>, symbol: NativeSymbol | undefined, site: Site): void {
  for (const key of symbol === undefined ? [] : declarationKeys(symbol)) {
    const sites = index.get(key);
    if (sites === undefined) {
      index.set(key, [site]);
    } else {
      sites.push(site);
    }
  }
}

function walk(world: NativeWorld, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files) {
    file.forEachChild(step);
  }
}

type PropertyName = Identifier | StringLiteral | NoSubstitutionTemplateLiteral;

const isPropertyName = (node: Node): node is PropertyName => isIdentifier(node) || isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

// How one property site resolves: its own symbol, or the property of that name on a node's contextual or plain type.
type Lookup =
  | { readonly site: Site; readonly by: "symbol"; readonly node: Node }
  | { readonly site: Site; readonly by: "contextual"; readonly node: Expression; readonly name: string }
  | { readonly site: Site; readonly by: "type"; readonly node: Node; readonly name: string };

const isClassLike = (node: Node): node is ClassDeclaration | ClassExpression => isClassDeclaration(node) || isClassExpression(node);

// A name the checker resolves straight to the property it means.
function isDirectPropertySite(node: Node): boolean {
  const parent = node.parent;
  if (isPropertyAccessExpression(parent)) {
    return parent.name === node;
  }
  if (isElementAccessExpression(parent)) {
    return parent.argumentExpression === node && (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node));
  }
  if (isBindingElement(parent)) {
    return parent.propertyName === node;
  }
  const declares =
    isPropertySignatureDeclaration(parent) ||
    isMethodSignatureDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    (isMethodDeclaration(parent) && !isObjectLiteralExpression(parent.parent));
  return declares && parent.name === node;
}

const isNamedMember = (parent: Node, node: Node): boolean =>
  (isPropertyAssignment(parent) ||
    isShorthandPropertyAssignment(parent) ||
    isMethodDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    isGetAccessorDeclaration(parent) ||
    isSetAccessorDeclaration(parent)) &&
  parent.name === node;

// The lookups for one name: an object literal key or JSX attribute through its literal's contextual type, a
// shorthand binding through its pattern's type, a class member through every type the class extends or implements.
function lookupsOf(world: NativeWorld, node: PropertyName): readonly Lookup[] {
  const site = world.siteOf(node);
  const { parent, text: name } = node;
  const own: readonly Lookup[] = isDirectPropertySite(node) ? [{ site, by: "symbol", node }] : [];
  if (isNamedMember(parent, node) && isObjectLiteralExpression(parent.parent)) {
    return [{ site, by: "contextual", node: parent.parent, name }];
  }
  if (isJsxAttribute(parent) && parent.name === node && isJsxAttributes(parent.parent)) {
    return [{ site, by: "contextual", node: parent.parent, name }];
  }
  if (isBindingElement(parent) && parent.propertyName === undefined && parent.name === node && isObjectBindingPattern(parent.parent)) {
    return [{ site, by: "type", node: parent.parent, name }];
  }
  if (isNamedMember(parent, node) && isClassLike(parent.parent)) {
    const bases = (parent.parent.heritageClauses ?? []).flatMap((clause) => [...clause.types]);
    return [...own, ...bases.map((base): Lookup => ({ site, by: "type", node: base, name }))];
  }
  return own;
}

// The properties named `name` on `type`, one per union member when the type is a union.
function* propertiesNamed(checker: Checker, type: Type, name: string): APIRequestGenerator<(NativeSymbol | undefined)[]> {
  const members = yield* constituents(type);
  const found: (NativeSymbol | undefined)[] = [];
  for (const member of members) {
    found.push(yield* checker.getPropertyOfType.gen(member, name));
  }
  return found;
}

/** Every property site of a world resolved to the property declarations it means. */
export function propertyIndex(world: NativeWorld): ReferenceIndex {
  const lookups: Lookup[] = [];
  walk(world, (node) => {
    if (isPropertyName(node)) {
      lookups.push(...lookupsOf(world, node));
    }
  });
  const { checker } = world;
  const found = world.batch(
    lookups.map(function* (lookup) {
      if (lookup.by === "symbol") {
        return [yield* checker.getSymbolAtLocation.gen(lookup.node)];
      }
      const type = lookup.by === "contextual" ? yield* checker.getContextualType.gen(lookup.node) : yield* checker.getTypeAtLocation.gen(lookup.node);
      return type === undefined ? [] : yield* propertiesNamed(checker, type, lookup.name);
    }),
  );
  const index = new Map<string, Site[]>();
  for (const [at, lookup] of lookups.entries()) {
    for (const symbol of found[at] ?? []) {
      credit(index, symbol, lookup.site);
    }
  }
  return index;
}

// A name in a type position, a declaration's own name or a module binding: never a value reference.
function isValueName(node: Identifier): boolean {
  const parent = node.parent;
  if (isShorthandPropertyAssignment(parent)) {
    return false;
  }
  if (isTypeReferenceNode(parent) || isTypeQueryNode(parent) || isQualifiedName(parent) || isExpressionWithTypeArguments(parent)) {
    return false;
  }
  const named = parent as { readonly name?: Node; readonly propertyName?: Node };
  return named.name !== node && named.propertyName !== node;
}

/** Every value reference of a world resolved through import aliases to the declarations it means. A shorthand
 *  property assignment reads the value its name binds. */
export function valueIndex(world: NativeWorld): ReferenceIndex {
  const plain: Identifier[] = [];
  const shorthand: Node[] = [];
  walk(world, (node) => {
    if (!isIdentifier(node)) {
      return;
    }
    if (isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
      shorthand.push(node.parent);
    } else if (isValueName(node)) {
      plain.push(node);
    }
  });
  const index = new Map<string, Site[]>();
  for (const [at, symbol] of world.symbolsAt(plain).entries()) {
    credit(index, symbol, world.siteOf(plain[at] as Node));
  }
  for (const [at, symbol] of world.shorthandValues(shorthand).entries()) {
    const assignment = shorthand[at] as Node & { readonly name: Node };
    credit(index, symbol, world.siteOf(assignment.name));
  }
  return index;
}
