// Engine one's reference index: every name in a world's files resolved to the declarations it means, in a few batched
// checker passes. An object literal key or shorthand binding resolves through its contextual or pattern type; a spread,
// computed key or reflective call reads by type; links join what no name does (`satisfies`, `Owner["m"]`, overloads).
import type {
  ClassDeclaration,
  ClassExpression,
  Expression,
  FunctionDeclaration,
  Identifier,
  InterfaceDeclaration,
  Node,
  NodeArray,
  NoSubstitutionTemplateLiteral,
  ParameterDeclaration,
  StringLiteral,
  TypeNode,
} from "@typescript/native/ast";
import {
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isElementAccessExpression,
  isExpressionWithTypeArguments,
  isForInStatement,
  isFunctionDeclaration,
  isFunctionTypeNode,
  isGetAccessorDeclaration,
  isIdentifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxAttributes,
  isJsxSpreadAttribute,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isTypeQueryNode,
  isTypeReferenceNode,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys, hasFlag } from "./native.ts";

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
  | {
      readonly site: Site;
      readonly by: "contextual";
      readonly node: Expression;
      readonly name: string;
      /** An object literal key, whose own symbol is what a read through the literal's kept type resolves to. */
      readonly literalKey: Node | null;
    }
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
    return [{ site, by: "contextual", node: parent.parent, name, literalKey: node }];
  }
  if (isJsxAttribute(parent) && parent.name === node && isJsxAttributes(parent.parent)) {
    return [{ site, by: "contextual", node: parent.parent, name, literalKey: null }];
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

/** The value whose properties a spread, a computed key, a `for…in` or a reflective call reads, and the key's
 *  expression for a computed element access. */
export interface Reflection<N> {
  readonly value: N;
  readonly key: N | null;
}

/** Calls that read every property of their arguments by reflection, by the callee's text. */
export const REFLECTIVE_CALLS: ReadonlySet<string> = new Set([
  "Object.entries",
  "Object.values",
  "Object.keys",
  "Object.assign",
  "JSON.stringify",
  "structuredClone",
]);

// A literal key names one property, which a name already reports; any other key expression reads by its type.
const isLiteralKey = (node: Node): boolean => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node);

function reflectionsAt(node: Node): readonly Reflection<Node>[] {
  if (isSpreadAssignment(node) || isJsxSpreadAttribute(node)) {
    return [{ value: node.expression, key: null }];
  }
  if (isElementAccessExpression(node) && !isLiteralKey(node.argumentExpression)) {
    return [{ value: node.expression, key: node.argumentExpression }];
  }
  if (isForInStatement(node)) {
    return [{ value: node.expression, key: null }];
  }
  if (isCallExpression(node) && REFLECTIVE_CALLS.has(node.expression.getText())) {
    return node.arguments.map((value) => ({ value, key: null }));
  }
  return [];
}

// The names a computed key can take, or null when it is a wide string and may name any property.
function* keyNames(checker: Checker, key: Node): APIRequestGenerator<readonly string[] | null> {
  const names: string[] = [];
  for (const member of yield* constituents(yield* checker.getTypeAtLocation.gen(key))) {
    if (member.isStringLiteralType()) {
      names.push(member.value);
    } else if (hasFlag(member.flags, TypeFlags.String)) {
      return null;
    }
  }
  return names;
}

/** Declarations no name joins, linked so a use of `from` counts for `to`: an object literal key and the member its
 *  contextual type gives it (a literal kept by `satisfies` is read through its own keys), a spread value's member
 *  and the same-named member of the type it is spread into, a member typed `Owner["m"]` and `Owner.m`, and an
 *  overload implementation's parameter member and each overload's. */
interface Link {
  readonly from: readonly string[];
  readonly to: readonly string[];
}

// The properties a reflection reads, and the links a spread into a typed literal makes instead. A spread member
// whose target member a library declares is read by that library.
function* reflected(world: NativeWorld, { value, key }: Reflection<Node>): APIRequestGenerator<{ readonly reads: NativeSymbol[]; readonly links: Link[] }> {
  const { checker } = world;
  const properties = yield* reflectedProperties(checker, value, key === null ? null : yield* keyNames(checker, key));
  const spreadInto = spreadTarget(value);
  const target = spreadInto === null ? undefined : yield* checker.getContextualType.gen(spreadInto);
  if (target === undefined) {
    return { reads: properties, links: [] };
  }
  const reads: NativeSymbol[] = [];
  const links: Link[] = [];
  for (const property of properties) {
    const into = (yield* propertiesNamed(checker, target, property.name)).filter((member) => member !== undefined);
    if (into.some((member) => member.declarations.every((handle) => world.fileOf(handle) === null))) {
      reads.push(property);
    } else if (into.length > 0) {
      links.push({ from: keysOf(into), to: declarationKeys(property) });
    }
  }
  return { reads, links };
}

// The object literal or JSX attributes a spread value lands in.
function spreadTarget(value: Node): Expression | null {
  const { parent } = value;
  const owner = parent.parent;
  const spread = (isSpreadAssignment(parent) && isObjectLiteralExpression(owner)) || (isJsxSpreadAttribute(parent) && isJsxAttributes(owner));
  return spread ? owner : null;
}

// All of a value's properties, or those a computed key's literal type names.
function* reflectedProperties(checker: Checker, value: Node, names: readonly string[] | null): APIRequestGenerator<NativeSymbol[]> {
  const found: NativeSymbol[] = [];
  for (const type of yield* constituents(yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(value)))) {
    if (names === null) {
      found.push(...(yield* checker.getPropertiesOfType.gen(type)));
    }
    for (const name of names ?? []) {
      const property = yield* checker.getPropertyOfType.gen(type, name);
      if (property !== undefined) {
        found.push(property);
      }
    }
  }
  return found;
}

const keysOf = (symbols: readonly (NativeSymbol | undefined)[]): readonly string[] =>
  symbols.flatMap((symbol) => (symbol === undefined ? [] : declarationKeys(symbol)));

// `readonly m: Owner["m"]`: the member and the `Owner` type node with the literal key it indexes.
function indexedMember(node: Node): { readonly member: Node; readonly owner: Node; readonly name: string } | null {
  if (!(isPropertySignatureDeclaration(node) && isIndexedAccessTypeNode(node.type))) {
    return null;
  }
  const { indexType, objectType } = node.type;
  const literal = isLiteralTypeNode(indexType) ? indexType.literal : undefined;
  return literal !== undefined && isStringLiteral(literal) ? { member: node.name, owner: objectType, name: literal.text } : null;
}

type Signature = FunctionDeclaration & { readonly name: Identifier };

// Each overload's type node beside the implementation's, by parameter position and through a returned function type.
function overloadPairs(implementation: Signature): readonly { readonly overload: TypeNode; readonly implementation: TypeNode }[] {
  const overloads: Signature[] = [];
  implementation.parent.forEachChild((node) => {
    if (isFunctionDeclaration(node) && node.body === undefined && node.name?.text === implementation.name.text) {
      overloads.push(node as Signature);
    }
  });
  return overloads.flatMap((overload) => typePairs(overload, implementation));
}

function typePairs(
  overload: { readonly parameters: NodeArray<ParameterDeclaration>; readonly type?: TypeNode | undefined },
  implementation: { readonly parameters: NodeArray<ParameterDeclaration>; readonly type?: TypeNode | undefined },
): readonly { readonly overload: TypeNode; readonly implementation: TypeNode }[] {
  const pairs = overload.parameters.flatMap((parameter, at) => {
    const own = implementation.parameters[at]?.type;
    return parameter.type === undefined || own === undefined ? [] : [{ overload: parameter.type, implementation: own }];
  });
  const { type: returned } = overload;
  const { type: implemented } = implementation;
  return returned !== undefined && implemented !== undefined && isFunctionTypeNode(returned) && isFunctionTypeNode(implemented)
    ? [...pairs, ...typePairs(returned, implemented)]
    : pairs;
}

// The implementation type's properties, each beside the same-named properties of the overload type's union members.
function* overloadLinks(checker: Checker, pair: { readonly overload: TypeNode; readonly implementation: TypeNode }): APIRequestGenerator<readonly Link[]> {
  const implementation = yield* checker.getPropertiesOfType.gen(yield* checker.getTypeAtLocation.gen(pair.implementation));
  const overload = yield* checker.getTypeAtLocation.gen(pair.overload);
  const links: Link[] = [];
  for (const property of implementation) {
    links.push({ from: declarationKeys(property), to: keysOf(yield* propertiesNamed(checker, overload, property.name)) });
  }
  return links;
}

// Every type an interface extends, directly or through its bases, a generic base through its generic target.
function* ancestors(type: Type): APIRequestGenerator<readonly Type[]> {
  const origin = type.isTypeReference() ? yield* type.getTarget.gen() : type;
  const direct = (yield* origin.getBaseTypes.gen()) ?? [];
  const all: Type[] = [...direct];
  for (const base of direct) {
    all.push(...(yield* ancestors(base)));
  }
  return all;
}

// An interface member that redeclares a base member is its own symbol: a use of it is a use of each member it redeclares.
function* redeclarations(checker: Checker, declaration: InterfaceDeclaration): APIRequestGenerator<readonly Link[]> {
  const symbol = yield* checker.getSymbolAtLocation.gen(declaration.name);
  const bases = symbol === undefined ? [] : yield* ancestors(yield* checker.getDeclaredTypeOfSymbol.gen(symbol));
  const links: Link[] = [];
  for (const member of declaration.members) {
    if (!((isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) && isPropertyName(member.name))) {
      continue;
    }
    const own = yield* checker.getSymbolAtLocation.gen(member.name);
    const inherited: (NativeSymbol | undefined)[] = [];
    for (const base of bases) {
      inherited.push(yield* checker.getPropertyOfType.gen(base, member.name.text));
    }
    links.push({ from: keysOf([own]), to: keysOf(inherited) });
  }
  return links;
}

/** Every property site of a world resolved to the property declarations it means. A spread, computed key, `for…in`
 *  or reflective call credits its value expression's site to each property it reads. */
export function propertyIndex(world: NativeWorld): ReferenceIndex {
  const lookups: Lookup[] = [];
  const extending: InterfaceDeclaration[] = [];
  const reflections: (Reflection<Node> & { readonly site: Site })[] = [];
  const indexed: { readonly member: Node; readonly owner: Node; readonly name: string }[] = [];
  const implementations: Signature[] = [];
  walk(world, (node) => {
    if (isPropertyName(node)) {
      lookups.push(...lookupsOf(world, node));
    }
    reflections.push(...reflectionsAt(node).map((reflection) => ({ ...reflection, site: world.siteOf(reflection.value) })));
    const member = indexedMember(node);
    if (member !== null) {
      indexed.push(member);
    }
    if (isFunctionDeclaration(node) && node.body !== undefined && node.name !== undefined) {
      implementations.push(node as Signature);
    }
    if (isInterfaceDeclaration(node) && node.heritageClauses !== undefined) {
      extending.push(node);
    }
  });
  const { checker } = world;
  const found = world.batch(
    lookups.map(function* (lookup): APIRequestGenerator<{ readonly symbols: (NativeSymbol | undefined)[]; readonly own: NativeSymbol | undefined }> {
      if (lookup.by === "symbol") {
        return { symbols: [yield* checker.getSymbolAtLocation.gen(lookup.node)], own: undefined };
      }
      const type = lookup.by === "contextual" ? yield* checker.getContextualType.gen(lookup.node) : yield* checker.getTypeAtLocation.gen(lookup.node);
      const symbols = type === undefined ? [] : yield* propertiesNamed(checker, type, lookup.name);
      const own = lookup.by === "contextual" && lookup.literalKey !== null ? yield* checker.getSymbolAtLocation.gen(lookup.literalKey) : undefined;
      return { symbols, own };
    }),
  );
  const reads = world.batch(reflections.map((reflection) => reflected(world, reflection)));
  const derived = world.batch(
    indexed.map(function* ({ member, owner, name }): APIRequestGenerator<Link> {
      const from = yield* checker.getSymbolAtLocation.gen(member);
      const to = yield* propertiesNamed(checker, yield* checker.getTypeAtLocation.gen(owner), name);
      return { from: keysOf([from]), to: keysOf(to) };
    }),
  );
  const overloaded = world.batch(implementations.flatMap(overloadPairs).map((pair) => overloadLinks(checker, pair)));
  const redeclared = world.batch(extending.map((declaration) => redeclarations(checker, declaration)));
  const index = new Map<string, Site[]>();
  const links: Link[] = [...derived, ...overloaded.flat(), ...redeclared.flat()];
  for (const [at, lookup] of lookups.entries()) {
    const { symbols, own } = found[at] ?? { symbols: [], own: undefined };
    for (const symbol of symbols) {
      credit(index, symbol, lookup.site);
    }
    if (own !== undefined) {
      links.push({ from: declarationKeys(own), to: keysOf(symbols) });
    }
  }
  for (const [at, reflection] of reflections.entries()) {
    const { reads: symbols, links: spread } = reads[at] ?? { reads: [], links: [] };
    for (const symbol of symbols) {
      credit(index, symbol, reflection.site);
    }
    links.push(...spread);
  }
  return linked(index, links);
}

// The index with each link's `from` sites added to its `to` keys, read from the unlinked index so order cannot matter.
function linked(index: Map<string, Site[]>, links: readonly Link[]): ReferenceIndex {
  const additions = links.flatMap(({ from, to }) => {
    const sites = from.flatMap((key) => index.get(key) ?? []);
    return sites.length === 0 ? [] : to.filter((key) => !from.includes(key)).map((key) => [key, sites] as const);
  });
  for (const [key, sites] of additions) {
    index.set(key, [...(index.get(key) ?? []), ...sites]);
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
