// Engine one's reference index: every name in a world's files resolved to the declarations it means, in a few batched
// checker passes. An object literal key or shorthand binding resolves through its contextual or pattern type; a spread,
// computed key or reflective call reads by type; links join what no name does (`satisfies`, `Owner["m"]`, overloads).
import type {
  CallExpression,
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
  isBinaryExpression,
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
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, TypeFlags } from "@typescript/native/sync";
import type { SendDestination, StoreWrite } from "./boundaries.ts";
import { copiedReads, serializedBy, storeWritesAt, tableDefinition } from "./boundaries.ts";
import type { Site } from "./classify.ts";
import { siteKey } from "./classify.ts";
import type { Flow } from "./handoffs.ts";
import { handoffFlows } from "./handoffs.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys, hasFlag, propertiesNamed } from "./native.ts";

/** Declaration key to the sites that resolve to it. */
export type ReferenceIndex = ReadonlyMap<string, readonly Site[]>;

function credit(index: Map<string, Site[]>, keys: readonly string[], site: Site): void {
  for (const key of keys) {
    const sites = index.get(key);
    if (sites === undefined) {
      index.set(key, [site]);
    } else {
      sites.push(site);
    }
  }
}

function walk(world: NativeWorld, home: ReadonlySet<string>, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files.filter((source) => home.has(world.siteOf(source).file))) {
    file.forEachChild(step);
  }
}

const everyFile = (world: NativeWorld): ReadonlySet<string> => new Set(world.files.map((file) => world.siteOf(file).file));

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

// The names `classify.ts` calls writes, known here so a flow can carry writes and reads apart.
function isWrittenName(node: Node): boolean {
  const { parent } = node;
  if (isNamedMember(parent, node) || (isJsxAttribute(parent) && parent.name === node)) {
    return true;
  }
  const assigned = parent.parent;
  return (
    isPropertyAccessExpression(parent) &&
    parent.name === node &&
    isBinaryExpression(assigned) &&
    assigned.left === parent &&
    assigned.operatorToken.kind === SyntaxKind.EqualsToken
  );
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
  // `"key" in value` reads the property of that name on the value's type.
  if (isBinaryExpression(parent) && parent.left === node && !isIdentifier(node) && parent.operatorToken.kind === SyntaxKind.InKeyword) {
    return [{ site, by: "type", node: parent.right, name }];
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

// The value whose properties a spread, a computed key, a `for…in` or a reflective call reads, and the key's expression
// for a computed element access. `sent` names where a serialization sends the value instead of reading it.
interface Reflection {
  readonly value: Node;
  readonly key: Node | null;
  readonly sent: SendDestination | null;
}

// Calls that read every property of their arguments by reflection, by the callee's text.
const REFLECTIVE_CALLS: ReadonlySet<string> = new Set(["Object.entries", "Object.values", "Object.keys", "Object.assign", "structuredClone", "nestedValue"]);
const SERIALIZE = "JSON.stringify";
// A Hono response: the value goes to whoever made the request, so only that reader's names count.
const RESPONSE = "c.json";

// A literal key names one property, which a name already reports; any other key expression reads by its type.
const isLiteralKey = (node: Node): boolean => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node);

function callReflections(node: CallExpression): readonly Reflection[] {
  const callee = node.expression.getText();
  if (callee === RESPONSE) {
    return node.arguments.slice(0, 1).map((value) => ({ value, key: null, sent: "http" }));
  }
  if (callee === SERIALIZE) {
    const serialized = serializedBy(node);
    return node.arguments.slice(0, 1).map((value) => ({ value, key: null, sent: serialized.whole ? null : serialized.destination }));
  }
  return REFLECTIVE_CALLS.has(callee) ? node.arguments.map((value) => ({ value, key: null, sent: null })) : [];
}

function reflectionsAt(node: Node): readonly Reflection[] {
  if (isSpreadAssignment(node) || isJsxSpreadAttribute(node)) {
    return [{ value: node.expression, key: null, sent: null }];
  }
  if (isElementAccessExpression(node) && !isLiteralKey(node.argumentExpression)) {
    return [{ value: node.expression, key: node.argumentExpression, sent: null }];
  }
  if (isForInStatement(node)) {
    return [{ value: node.expression, key: null, sent: null }];
  }
  return isCallExpression(node) ? callReflections(node) : [];
}

// The names a computed key can take, or null when it is a wide string and may name any property. A key typed by a
// type parameter takes the names of its constraint.
function* keyNames(checker: Checker, key: Node): APIRequestGenerator<readonly string[] | null> {
  const names: string[] = [];
  const type = yield* checker.getTypeAtLocation.gen(key);
  const bound = hasFlag(type.flags, TypeFlags.TypeParameter) ? yield* checker.getBaseConstraintOfType.gen(type) : undefined;
  for (const member of yield* constituents(bound ?? type)) {
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

// What a reflection reads, as types: its value, the type a spread lands in, and a computed key's names.
interface ReflectedShape {
  readonly value: Type;
  readonly target: Type | undefined;
  readonly names: readonly string[] | null;
}

function* shapeOf(checker: Checker, { value, key }: Reflection): APIRequestGenerator<ReflectedShape> {
  const names = key === null ? null : yield* keyNames(checker, key);
  const spreadInto = spreadTarget(value);
  return {
    value: yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(value)),
    target: spreadInto === null ? undefined : yield* checker.getContextualType.gen(spreadInto),
    names,
  };
}

const shapeKey = ({ value, target, names }: ReflectedShape): string => `${value.id}|${target?.id ?? ""}|${names?.join("|") ?? "*"}`;

interface Reflected {
  readonly reads: readonly NativeSymbol[];
  readonly links: readonly Link[];
  readonly flows: readonly Flow[];
}

// The properties a reflection reads, and the links a spread into a typed literal makes instead. A spread member
// whose target member a library declares is read by that library.
function* reflected(world: NativeWorld, { value, target, names }: ReflectedShape): APIRequestGenerator<Reflected> {
  const { checker } = world;
  const properties = yield* reflectedProperties(checker, value, names);
  if (target === undefined) {
    return { reads: properties, links: [], flows: [] };
  }
  const named = yield* all(...properties.map((property) => propertiesNamed(checker, target, property.name)));
  const reads: NativeSymbol[] = [];
  const links: Link[] = [];
  const flows: Flow[] = [];
  for (const [at, property] of properties.entries()) {
    const into = (named[at] ?? []).filter((member) => member !== undefined);
    if (into.some((member) => member.declarations.every((handle) => world.fileOf(handle) === null))) {
      reads.push(property);
    } else if (into.length > 0) {
      links.push({ from: keysOf(into), to: declarationKeys(property) });
      flows.push({ source: declarationKeys(property), sink: keysOf(into) });
    }
  }
  return { reads, links, flows };
}

// Each distinct shape once, so a library props type spread at many sites lists its properties a single time.
function reflectedOnce(world: NativeWorld, reflections: readonly Reflection[]): readonly Reflected[] {
  const shapes = world.batch(reflections.map((reflection) => shapeOf(world.checker, reflection)));
  const distinct = new Map(shapes.map((shape) => [shapeKey(shape), shape]));
  const answers = world.batch([...distinct.values()].map((shape) => reflected(world, shape)));
  const byKey = new Map([...distinct.keys()].map((key, at) => [key, answers[at] as Reflected]));
  return shapes.map((shape) => byKey.get(shapeKey(shape)) as Reflected);
}

// The object literal or JSX attributes a spread value lands in.
function spreadTarget(value: Node): Expression | null {
  const { parent } = value;
  const owner = parent.parent;
  const spread = (isSpreadAssignment(parent) && isObjectLiteralExpression(owner)) || (isJsxSpreadAttribute(parent) && isJsxAttributes(owner));
  return spread ? owner : null;
}

// All of a value's properties, or those a computed key's literal type names.
function* reflectedProperties(checker: Checker, value: Type, names: readonly string[] | null): APIRequestGenerator<NativeSymbol[]> {
  const types = yield* constituents(value);
  if (names === null) {
    return (yield* all(...types.map((type) => checker.getPropertiesOfType.gen(type)))).flat();
  }
  const found = yield* all(...types.flatMap((type) => names.map((name) => checker.getPropertyOfType.gen(type, name))));
  return found.filter((property) => property !== undefined);
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
  const named = yield* all(...implementation.map((property) => propertiesNamed(checker, overload, property.name)));
  return implementation.map((property, at) => ({ from: declarationKeys(property), to: keysOf(named[at] ?? []) }));
}

// Every type an interface extends, directly or through its bases, a generic base through its generic target.
function* ancestors(type: Type): APIRequestGenerator<readonly Type[]> {
  const origin = type.isTypeReference() ? yield* type.getTarget.gen() : type;
  const direct = (yield* origin.getBaseTypes.gen()) ?? [];
  return [...direct, ...(yield* all(...direct.map((base) => ancestors(base)))).flat()];
}

// An interface member that redeclares a base member is its own symbol: a use of it is a use of each member it redeclares.
function* redeclarations(checker: Checker, declaration: InterfaceDeclaration): APIRequestGenerator<readonly Link[]> {
  const symbol = yield* checker.getSymbolAtLocation.gen(declaration.name);
  const bases = symbol === undefined ? [] : yield* ancestors(yield* checker.getDeclaredTypeOfSymbol.gen(symbol));
  const names = declaration.members.flatMap((member) =>
    (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) && isPropertyName(member.name) ? [member.name] : [],
  );
  return yield* all(
    ...names.map(function* (name): APIRequestGenerator<Link> {
      const [own, inherited] = yield* all(checker.getSymbolAtLocation.gen(name), all(...bases.map((base) => checker.getPropertyOfType.gen(base, name.text))));
      return { from: keysOf([own]), to: keysOf(inherited) };
    }),
  );
}

/** A serialization that sends a declaration's value out of the process, and where. */
export interface Send {
  readonly site: Site;
  readonly destination: SendDestination;
}

/** A world's property sites: `index` joins every link and flow. `direct` holds the sites that name each declaration and
 *  the writes a value carried in: a link says who uses a member, a flow says a value really arrived. `sends` holds,
 *  per declaration, the serializations that send it without a read. */
export interface PropertyReferences {
  readonly index: ReferenceIndex;
  readonly direct: ReferenceIndex;
  readonly sends: ReadonlyMap<string, readonly Send[]>;
  /** The {@link siteKey} of every read that only copies a value into a stored column, which no audit may count as a read. */
  readonly copied: ReadonlySet<string>;
}

/** What a world's files say before any join: each site with the declarations it resolves to, in walk order. */
export interface PropertyFacts {
  readonly credits: readonly { readonly site: Site; readonly keys: readonly string[] }[];
  readonly links: readonly Link[];
  readonly flows: readonly Flow[];
  /** The {@link siteKey} of every written name. */
  readonly written: ReadonlySet<string>;
  readonly sends: readonly (Send & { readonly keys: readonly string[] })[];
  readonly copied: ReadonlySet<string>;
}

// What a Drizzle write stores: a column key credited with each literal key that writes it, the flows from the stored
// value's members into the columns, and the copied reads that hand a value to a column.
interface Stored {
  readonly credits: readonly { readonly site: Site; readonly keys: readonly string[] }[];
  readonly flows: readonly Flow[];
  readonly copied: readonly { readonly site: Site; readonly column: readonly string[] }[];
}

function* columnKeys(checker: Checker, table: Type, name: string): APIRequestGenerator<readonly string[]> {
  const column = yield* checker.getPropertyOfType.gen(table, name);
  return column === undefined ? [] : declarationKeys(column);
}

// A stored value's members flow into the same-named columns, an array's through its element type.
function* memberFlows(checker: Checker, table: Type, value: Node): APIRequestGenerator<readonly Flow[]> {
  const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(value));
  const element = (yield* checker.isArrayType.gen(type)) && type.isTypeReference() ? (yield* checker.getTypeArguments.gen(type))[0] : undefined;
  const members = yield* constituents(element ?? type);
  const properties = (yield* all(...members.map((member) => checker.getPropertiesOfType.gen(member)))).flat();
  const sinks = yield* all(...properties.map((property) => columnKeys(checker, table, property.name)));
  return properties.flatMap((property, at) => {
    const sink = sinks[at] ?? [];
    return sink.length === 0 ? [] : [{ source: declarationKeys(property), sink }];
  });
}

function* storedBy(world: NativeWorld, { table, value }: StoreWrite): APIRequestGenerator<Stored> {
  const { checker } = world;
  const tableType = yield* checker.getTypeAtLocation.gen(table);
  if (!isObjectLiteralExpression(value)) {
    return { credits: [], flows: yield* memberFlows(checker, tableType, value), copied: [] };
  }
  const credits: Stored["credits"][number][] = [];
  const flows: Flow[] = [];
  const copied: Stored["copied"][number][] = [];
  for (const property of value.properties) {
    if (isSpreadAssignment(property)) {
      flows.push(...(yield* memberFlows(checker, tableType, property.expression)));
      continue;
    }
    const { name } = property as { readonly name?: Node };
    if (name === undefined || !isPropertyName(name)) {
      continue;
    }
    const column = yield* columnKeys(checker, tableType, name.text);
    credits.push({ site: world.siteOf(name), keys: column });
    const reads = isPropertyAssignment(property) ? copiedReads(property.initializer) : [];
    copied.push(...reads.map((read) => ({ site: world.siteOf(read), column })));
  }
  return { credits, flows, copied };
}

// A literal handed to a Drizzle write: its spreads flow into columns rather than being read by the library.
function storedLiterals(stores: readonly StoreWrite[]): ReadonlySet<Node> {
  return new Set(stores.flatMap(({ value }) => (isObjectLiteralExpression(value) ? [value] : [])));
}

const within = (site: Site, spans: readonly { readonly file: string; readonly start: number; readonly end: number }[]): boolean =>
  spans.some((span) => span.file === site.file && site.position >= span.start && site.position < span.end);

const DB_SCHEMA = "packages/db/src/schema/";

// Each table's column keys by name, keyed by the table's sorted column names.
type TablesBySignature = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

const signatureOf = (names: Iterable<string>): string => [...names].toSorted().join(",");

// A row typed `typeof table.$inferSelect` or `$inferInsert` has members no declaration backs, so its reads resolve to
// nothing. Its member names are exactly its table's column names, which is how such a read finds its column.
function tablesOf(world: NativeWorld): TablesBySignature {
  const schemas = new Set(world.files.map((file) => world.siteOf(file).file).filter((file) => file.startsWith(DB_SCHEMA)));
  const tables: (readonly PropertyName[])[] = [];
  walk(world, schemas, (node) => {
    const definition = tableDefinition(node);
    if (definition !== null) {
      tables.push(definition.columns.properties.flatMap((column) => (isPropertyAssignment(column) && isPropertyName(column.name) ? [column.name] : [])));
    }
  });
  const names = tables.flat();
  const keyed = new Map(world.symbolsAt(names).map((symbol, at) => [names[at], keysOf([symbol])] as const));
  // Two tables with the same column names cannot be told apart by a row type, so such a read reads both.
  const bySignature = new Map<string, Map<string, readonly string[]>>();
  for (const columns of tables) {
    const signature = signatureOf(columns.map((name) => name.text));
    const merged = bySignature.get(signature) ?? new Map<string, readonly string[]>();
    for (const name of columns) {
      merged.set(name.text, [...(merged.get(name.text) ?? []), ...(keyed.get(name) ?? [])]);
    }
    bySignature.set(signature, merged);
  }
  return bySignature;
}

// The expression whose type holds the member a lookup with no declaration names.
function receiverOf(lookup: Lookup): Node | null {
  if (lookup.by === "type") {
    return lookup.node;
  }
  const { parent } = lookup.node;
  if (isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) {
    return parent.expression;
  }
  return isBindingElement(parent) ? parent.parent : null;
}

function* rowColumn(checker: Checker, tables: TablesBySignature, receiver: Node, name: string): APIRequestGenerator<readonly string[]> {
  const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(receiver));
  const members = yield* constituents(type);
  const named = yield* all(...members.map((member) => checker.getPropertiesOfType.gen(member)));
  return named.flatMap((properties) => tables.get(signatureOf(properties.map((property) => property.name)))?.get(name) ?? []);
}

/** The column each declaration-less lookup reads through a Drizzle row type, by lookup position. */
function rowColumnReads(
  world: NativeWorld,
  lookups: readonly Lookup[],
  resolved: readonly (readonly string[])[],
  unresolved: readonly boolean[],
): ReadonlyMap<number, readonly string[]> {
  const tables = tablesOf(world);
  const asked = lookups.flatMap((lookup, at) => {
    const receiver = unresolved[at] === true && (resolved[at] ?? []).length === 0 ? receiverOf(lookup) : null;
    const name = lookup.by === "symbol" ? (lookup.node as PropertyName).text : lookup.name;
    return receiver === null ? [] : [{ at, receiver, name }];
  });
  const columns = world.batch(asked.map(({ receiver, name }) => rowColumn(world.checker, tables, receiver, name)));
  return new Map(asked.flatMap(({ at }, index) => ((columns[index] ?? []).length === 0 ? [] : [[at, columns[index] ?? []] as const])));
}

/** Every property site of a world resolved to the property declarations it means. A spread, computed key, `for…in`
 *  or reflective call credits its value expression's site to each property it reads. */
export function propertyIndex(world: NativeWorld): ReferenceIndex {
  return joinFacts([propertyFacts(world)]).index;
}

/** The unjoined facts of a world's `home` files. */
export function propertyFacts(world: NativeWorld, home: ReadonlySet<string> = everyFile(world)): PropertyFacts {
  const lookups: Lookup[] = [];
  const extending: InterfaceDeclaration[] = [];
  const reflections: (Reflection & { readonly site: Site })[] = [];
  const indexed: { readonly member: Node; readonly owner: Node; readonly name: string }[] = [];
  const implementations: Signature[] = [];
  const written = new Set<string>();
  const stores: StoreWrite[] = [];
  const definitions: { readonly file: string; readonly start: number; readonly end: number }[] = [];
  const columnNames: Node[] = [];
  const lookUp = (node: PropertyName): void => {
    const named = lookupsOf(world, node);
    lookups.push(...named);
    for (const lookup of isWrittenName(node) ? named : []) {
      written.add(siteKey(lookup.site));
    }
  };
  walk(world, home, (node) => {
    if (isPropertyName(node)) {
      lookUp(node);
    }
    stores.push(...storeWritesAt(node));
    const definition = tableDefinition(node);
    if (definition !== null) {
      const { file } = world.siteOf(definition.call);
      definitions.push({ file, start: definition.call.pos, end: definition.call.end });
      columnNames.push(...definition.columns.properties.flatMap((column) => (isPropertyAssignment(column) ? [column.name] : [])));
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
  const literals = storedLiterals(stores);
  const kept = reflections.filter((reflection) => !(isSpreadAssignment(reflection.value.parent) && literals.has(reflection.value.parent.parent)));
  const reads = reflectedOnce(world, kept);
  const stored = storeFacts(world, stores, definitions, columnNames);
  const derived = world.batch(
    indexed.map(function* ({ member, owner, name }): APIRequestGenerator<Link> {
      const from = yield* checker.getSymbolAtLocation.gen(member);
      const to = yield* propertiesNamed(checker, yield* checker.getTypeAtLocation.gen(owner), name);
      return { from: keysOf([from]), to: keysOf(to) };
    }),
  );
  const overloaded = world.batch(implementations.flatMap(overloadPairs).map((pair) => overloadLinks(checker, pair)));
  const redeclared = world.batch(extending.map((declaration) => redeclarations(checker, declaration)));
  const credits: { readonly site: Site; readonly keys: readonly string[] }[] = [...stored.credits];
  const links: Link[] = [...derived, ...overloaded.flat(), ...redeclared.flat()];
  const flows: Flow[] = [...handoffFlows(world, home), ...stored.flows];
  const sends: PropertyFacts["sends"][number][] = [...stored.sends];
  const rows = rowColumnReads(
    world,
    lookups,
    found.map(({ symbols }) => keysOf(symbols)),
    found.map(({ symbols }) => symbols.some((symbol) => symbol !== undefined && symbol.declarations.length === 0)),
  );
  for (const [at, lookup] of lookups.entries()) {
    const { symbols, own } = found[at] ?? { symbols: [], own: undefined };
    const keys = rows.get(at) ?? keysOf(symbols);
    const column = stored.copied.get(siteKey(lookup.site));
    if (column !== undefined) {
      flows.push({ source: keys, sink: column });
      sends.push({ site: lookup.site, destination: "column", keys });
    } else if (!stored.defines(lookup.site, keys)) {
      credits.push({ site: lookup.site, keys });
    }
    if (own !== undefined) {
      // An uncontextual literal's key is its own declaration, and the write a later hand-off carries on.
      credits.push({ site: lookup.site, keys: declarationKeys(own) });
      links.push({ from: declarationKeys(own), to: keys });
    }
  }
  for (const [at, reflection] of kept.entries()) {
    const { reads: symbols, links: spread, flows: carried } = reads[at] ?? { reads: [], links: [], flows: [] };
    if (reflection.sent === null) {
      credits.push({ site: reflection.site, keys: keysOf(symbols) });
    } else {
      sends.push({ site: reflection.site, destination: reflection.sent, keys: keysOf(symbols) });
    }
    links.push(...spread);
    flows.push(...carried);
  }
  return { credits, links, flows, written, sends, copied: new Set(stored.copied.keys()) };
}

interface StoreFacts {
  readonly credits: readonly { readonly site: Site; readonly keys: readonly string[] }[];
  readonly flows: readonly Flow[];
  /** The column each copied read hands its value to, by {@link siteKey}. */
  readonly copied: ReadonlyMap<string, readonly string[]>;
  /** Whether a read is a column named inside a table definition: an index or a foreign key, no stored value read back. */
  readonly defines: (site: Site, keys: readonly string[]) => boolean;
  /** Each stored value's members, sent to their columns at the write. */
  readonly sends: PropertyFacts["sends"];
}

function storeFacts(
  world: NativeWorld,
  stores: readonly StoreWrite[],
  definitions: readonly { readonly file: string; readonly start: number; readonly end: number }[],
  columnNames: readonly Node[],
): StoreFacts {
  const stored = world.batch(stores.map((store) => storedBy(world, store)));
  const columns = new Set(world.symbolsAt(columnNames).flatMap((symbol) => (symbol === undefined ? [] : declarationKeys(symbol))));
  return {
    credits: stored.flatMap((store) => store.credits),
    flows: stored.flatMap((store) => store.flows),
    copied: new Map(stored.flatMap((store) => store.copied.map(({ site, column }) => [siteKey(site), column] as const))),
    defines: (site, keys) => keys.length > 0 && keys.every((key) => columns.has(key)) && within(site, definitions),
    sends: stored.flatMap((store, at) => {
      const site = world.siteOf((stores[at] as StoreWrite).value);
      return store.flows.map(({ source }) => ({ site, destination: "column" as const, keys: source }));
    }),
  };
}

// Each declaration's sends. A literal's own key a serialization sends also sends the member its contextual type gives
// it, as a read through the link would read it.
function sendsOf(facts: readonly PropertyFacts[], links: readonly Link[]): ReadonlyMap<string, readonly Send[]> {
  const sends = new Map<string, Send[]>();
  const add = (key: string, sent: readonly Send[]): void => {
    sends.set(key, [...(sends.get(key) ?? []), ...sent]);
  };
  for (const { site, destination, keys } of facts.flatMap((part) => part.sends)) {
    for (const key of keys) {
      add(key, [{ site, destination }]);
    }
  }
  for (const { from, to } of links) {
    const carried = from.flatMap((key) => sends.get(key) ?? []);
    for (const key of carried.length === 0 ? [] : to.filter((candidate) => !from.includes(candidate))) {
      add(key, carried);
    }
  }
  return sends;
}

/** The indexes the facts of several file sets make together, every link and flow joined once over all of them. */
export function joinFacts(facts: readonly PropertyFacts[]): PropertyReferences {
  const index = new Map<string, Site[]>();
  const written = new Set<string>();
  for (const part of facts) {
    for (const { site, keys } of part.credits) {
      credit(index, keys, site);
    }
    for (const key of part.written) {
      written.add(key);
    }
  }
  const links = facts.flatMap((part) => part.links);
  const sends = sendsOf(facts, links);
  const { down, up } = flowEdges(facts.flatMap((part) => part.flows));
  const isWrite = (site: Site): boolean => written.has(siteKey(site));
  const isOther = (site: Site): boolean => !isWrite(site);
  const joined = linked(index, links);
  return {
    index: withCarried(withCarried(joined, carriedAlong(joined, down, isWrite)), carriedAlong(joined, up, isOther)),
    direct: withCarried(index, carriedAlong(index, down, isWrite)),
    sends,
    copied: new Set(facts.flatMap((part) => [...part.copied])),
  };
}

// The index with each link's `from` sites added to its `to` keys, read from the unlinked index so order cannot matter.
function linked(index: ReadonlyMap<string, readonly Site[]>, links: readonly Link[]): ReferenceIndex {
  const sources = new Map<string, Set<string>>();
  for (const { from, to } of links) {
    for (const key of to.filter((candidate) => !from.includes(candidate))) {
      const known = sources.get(key) ?? new Set();
      sources.set(
        key,
        from.reduce((held, source) => held.add(source), known),
      );
    }
  }
  const joined = new Map(index);
  for (const [key, from] of sources) {
    const sites = new Set(index.get(key));
    for (const source of from) {
      for (const site of index.get(source) ?? []) {
        sites.add(site);
      }
    }
    joined.set(key, [...sites]);
  }
  return joined;
}

function addEdge(edges: Map<string, Set<string>>, from: string, to: string): void {
  edges.set(from, (edges.get(from) ?? new Set()).add(to));
}

// Each key's `carried` sites spread along `edges` until nothing grows, so a chain of hand-offs and a cycle both settle.
function carriedAlong(
  index: ReferenceIndex,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  carried: (site: Site) => boolean,
): ReadonlyMap<string, Set<Site>> {
  const held = new Map<string, Set<Site>>();
  const holding = (key: string): Set<Site> => {
    const sites = held.get(key) ?? new Set((index.get(key) ?? []).filter(carried));
    held.set(key, sites);
    return sites;
  };
  const queue = [...edges.keys()];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const sites = holding(key);
    for (const next of edges.get(key) ?? []) {
      const into = holding(next);
      const before = into.size;
      for (const site of sites) {
        into.add(site);
      }
      if (into.size > before) {
        queue.push(next);
      }
    }
  }
  return held;
}

interface FlowEdges {
  readonly down: ReadonlyMap<string, ReadonlySet<string>>;
  readonly up: ReadonlyMap<string, ReadonlySet<string>>;
}

function flowEdges(flows: readonly Flow[]): FlowEdges {
  const down = new Map<string, Set<string>>();
  const up = new Map<string, Set<string>>();
  for (const { source, sink } of flows) {
    for (const from of source) {
      for (const to of sink.filter((key) => !source.includes(key))) {
        addEdge(down, from, to);
        addEdge(up, to, from);
      }
    }
  }
  return { down, up };
}

function withCarried(index: ReferenceIndex, carried: ReadonlyMap<string, ReadonlySet<Site>>): ReferenceIndex {
  const joined = new Map(index);
  for (const [key, sites] of carried) {
    joined.set(key, [...new Set([...(joined.get(key) ?? []), ...sites])]);
  }
  return joined;
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
export function valueIndex(world: NativeWorld, home: ReadonlySet<string> = everyFile(world)): ReferenceIndex {
  const plain: Identifier[] = [];
  const shorthand: Node[] = [];
  walk(world, home, (node) => {
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
    credit(index, symbol === undefined ? [] : declarationKeys(symbol), world.siteOf(plain[at] as Node));
  }
  for (const [at, symbol] of world.shorthandValues(shorthand).entries()) {
    const assignment = shorthand[at] as Node & { readonly name: Node };
    credit(index, symbol === undefined ? [] : declarationKeys(symbol), world.siteOf(assignment.name));
  }
  return index;
}
