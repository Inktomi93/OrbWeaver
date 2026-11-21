// Engine one's reference index: every name and string key in a world's files resolved to the declarations it means
// through the key resolver (`tooling/src/unwired/key-resolver.ts`), in a few batched checker passes; a spread,
// computed key or reflective call reads by type; links join what no name does (`satisfies`, `Owner["m"]`, overloads).
import type {
  CallExpression,
  Expression,
  FunctionDeclaration,
  Identifier,
  InterfaceDeclaration,
  Node,
  NodeArray,
  ParameterDeclaration,
  TypeNode,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isElementAccessExpression,
  isExpressionWithTypeArguments,
  isForInStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isIdentifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxAttributes,
  isJsxSpreadAttribute,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isTypeQueryNode,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, TypeFlags } from "@typescript/native/sync";
import type { SendDestination, StoreWrite } from "./boundaries.ts";
import { copiedReads, serializedBy, storeWritesAt, tableDefinition } from "./boundaries.ts";
import type { Site, SyntaxRole } from "./classify.ts";
import { siteKey } from "./classify.ts";
import type { Flow } from "./handoffs.ts";
import { handoffFlows } from "./handoffs.ts";
import type { KeyResolution, UnresolvedReason } from "./key-resolver.ts";
import { resolveKeys } from "./key-resolver.ts";
import type { NativeWorld, PropertyName } from "./native.ts";
import { constituents, declarationKeys, hasFlag, isNamedMember, isPropertyName, propertiesNamed } from "./native.ts";
import { heldMembers, isOpenType, openFacts } from "./open-sends.ts";

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

// `=`, a compound `+=` and a logical `??=`: each stores into its left side; the value read on the way is only the store's.
const isAssignment = (kind: SyntaxKind): boolean => kind >= SyntaxKind.FirstAssignment && kind <= SyntaxKind.LastAssignment;

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
    isAssignment(assigned.operatorToken.kind)
  );
}

// The value whose properties a spread, a computed key, a `for…in` or a reflective call reads, and the key's expression
// for a computed element access. `sent` names where a serialization sends the value instead of reading it.
interface Reflection {
  readonly value: Node;
  readonly key: Node | null;
  readonly sent: SendDestination | null;
  /** The reflection reads nested members too, as deep as a send carries them. */
  readonly nested?: true;
}

// Calls that read every property of their arguments by reflection, by the callee's text.
const REFLECTIVE_CALLS: ReadonlySet<string> = new Set(["Object.entries", "Object.values", "Object.keys", "Object.assign", "structuredClone"]);
// A dotted-path read, `nestedValue(value, "a.b")`: its path is a wide string, so it may reach any nested member of its value.
const NESTED_READS: ReadonlySet<string> = new Set(["nestedValue"]);
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
  if (NESTED_READS.has(callee)) {
    return node.arguments.slice(0, 1).map((value) => ({ value, key: null, sent: null, nested: true }));
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
      // A key a mapped or template-literal type builds has no declaration, so the spread links and writes nothing for
      // it: its type names the key, not the value. The literal key that built the value is the write.
    } else if (property.declarations.length > 0 && into.length > 0) {
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

// `(load: Owner["m"]) => load()`: a parameter or variable typed by a member. Its reads are the member's reads only when
// the value it holds is the member's value: an identifier the code also writes into `Owner.m`, as a composition root
// builds a verb once, puts it in the service and hands it to a sibling. The type annotation alone proves nothing, since
// any value of that type fits the binding.
interface DerivedBinding {
  readonly binding: Identifier;
  readonly owner: Node;
  readonly name: string;
  /** Where the binding's reads can sit: its function for a parameter, its file for a variable. */
  readonly scope: Node;
  /** A variable's initializer, the one value it holds. */
  readonly initializer: Identifier | null;
  /** The name a call that supplies a parameter calls, and the parameter's position. */
  readonly callee: Identifier | null;
  readonly index: number;
}

// The name a call of a function uses: a declared function's or method's own name, or the variable an arrow is bound to.
function calleeName(fn: Node): Identifier | null {
  if ((isFunctionDeclaration(fn) || isMethodDeclaration(fn)) && fn.name !== undefined && isIdentifier(fn.name)) {
    return fn.name;
  }
  return (isArrowFunction(fn) || isFunctionExpression(fn)) && isVariableDeclaration(fn.parent) && isIdentifier(fn.parent.name) ? fn.parent.name : null;
}

// The identifier a supplied value is, through parentheses and assertions; null for any other expression.
function suppliedName(node: Node | undefined): Identifier | null {
  let value = node;
  while (value !== undefined && (isParenthesizedExpression(value) || isAsExpression(value) || isSatisfiesExpression(value) || isNonNullExpression(value))) {
    value = value.expression;
  }
  return value !== undefined && isIdentifier(value) ? value : null;
}

function derivedBinding(node: Node): DerivedBinding | null {
  if (!((isParameterDeclaration(node) || isVariableDeclaration(node)) && isIdentifier(node.name) && node.type !== undefined)) {
    return null;
  }
  let type: TypeNode = node.type;
  while (isParenthesizedTypeNode(type)) {
    type = type.type;
  }
  if (!isIndexedAccessTypeNode(type)) {
    return null;
  }
  const literal = isLiteralTypeNode(type.indexType) ? type.indexType.literal : undefined;
  if (literal === undefined || !isStringLiteral(literal)) {
    return null;
  }
  const shape = { binding: node.name, owner: type.objectType, name: literal.text };
  if (isVariableDeclaration(node)) {
    return { ...shape, scope: node.getSourceFile(), initializer: suppliedName(node.initializer), callee: null, index: -1 };
  }
  const fn = node.parent as Node & { readonly parameters: NodeArray<ParameterDeclaration> };
  return { ...shape, scope: fn, initializer: null, callee: calleeName(fn), index: fn.parameters.indexOf(node) };
}

function bindingReaders({ binding, scope }: DerivedBinding): readonly Identifier[] {
  const found: Identifier[] = [];
  const visit = (node: Node): void => {
    if (isIdentifier(node) && node !== binding && node.text === binding.text && isValueName(node)) {
      found.push(node);
    }
    node.forEachChild(visit);
  };
  scope.forEachChild(visit);
  return found;
}

/** What a world's files say about derived bindings, joined over every world by {@link joinFacts}: each binding with
 *  its reads, each call that supplies one of its parameters, and each identifier written into a member. */
interface DerivedFacts {
  readonly bindings: readonly {
    readonly members: readonly string[];
    readonly reads: readonly Site[];
    /** The keys of a variable's initializer, which is its one supplier. */
    readonly initializer: readonly string[];
    readonly callee: readonly string[];
    readonly index: number;
  }[];
  readonly supplies: readonly { readonly callee: readonly string[]; readonly index: number; readonly value: readonly string[] }[];
  readonly writes: readonly { readonly value: readonly string[]; readonly members: readonly string[] }[];
}

// The names of the functions whose parameters a derived binding types, across every file the world holds: a caller in
// this world's home files may call a function another world homes.
function derivedCallees(world: NativeWorld): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: Node): void => {
    const callee = isParameterDeclaration(node) ? derivedBinding(node)?.callee : undefined;
    if (callee !== undefined && callee !== null) {
      names.add(callee.text);
    }
    node.forEachChild(visit);
  };
  for (const file of world.files) {
    file.forEachChild(visit);
  }
  return names;
}

interface Supply {
  readonly callee: Node;
  readonly index: number;
  readonly value: Identifier;
}

// Each identifier argument a call hands to a function `names` holds, by the argument's position.
function suppliesAt(node: Node, names: ReadonlySet<string>): readonly Supply[] {
  if (!isCallExpression(node)) {
    return [];
  }
  const callee = isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
  if (!(isIdentifier(callee) && names.has(callee.text))) {
    return [];
  }
  return node.arguments.flatMap((argument, index) => {
    const value = suppliedName(argument);
    return value === null ? [] : [{ callee, index, value }];
  });
}

// Each node's resolved keys, an import alias followed; empty where the node is absent.
function keysAt(world: NativeWorld, nodes: readonly (Node | null)[]): readonly (readonly string[])[] {
  const present = nodes.flatMap((node) => (node === null ? [] : [node]));
  const symbols = world.symbolsAt(present);
  let next = 0;
  return nodes.map((node) => (node === null ? [] : keysOf([symbols[next++]])));
}

// The derived facts of a world's home files. `keyWrites` holds each object literal key the walk resolved, with the
// member keys it writes; only a key whose value names a supplied identifier is asked for its value's symbol.
function derivedFacts(
  world: NativeWorld,
  bindings: readonly DerivedBinding[],
  supplies: readonly Supply[],
  keyWrites: readonly { readonly key: Node; readonly members: readonly string[] }[],
): DerivedFacts {
  const { checker } = world;
  const readers = bindings.map(bindingReaders);
  const answers = world.batch(
    bindings.map(function* ({ binding, owner, name }, at) {
      const own = yield* checker.getSymbolAtLocation.gen(binding);
      const members = yield* propertiesNamed(checker, yield* checker.getTypeAtLocation.gen(owner), name);
      const read = yield* all(...(readers[at] ?? []).map((reader) => checker.getSymbolAtLocation.gen(reader)));
      return { own: keysOf([own]), members: keysOf(members), read: read.map((symbol) => keysOf([symbol])) };
    }),
  );
  const initializers = keysAt(
    world,
    bindings.map(({ initializer }) => initializer),
  );
  const callees = keysAt(
    world,
    bindings.map(({ callee }) => callee),
  );
  const supplyCallees = world.symbolsAt(supplies.map(({ callee }) => callee));
  const supplyValues = world.symbolsAt(supplies.map(({ value }) => value));
  const supplied = new Set([
    ...supplies.map(({ value }) => value.text),
    ...bindings.flatMap(({ initializer }) => (initializer === null ? [] : [initializer.text])),
  ]);
  const written = keyWrites.flatMap((write) => {
    const value = valueOfKey(write.key);
    return isIdentifier(value) && supplied.has(value.text) ? [{ ...write, value }] : [];
  });
  const shorthand = written.filter(({ key }) => isShorthandPropertyAssignment(key.parent));
  const plain = written.filter(({ key }) => !isShorthandPropertyAssignment(key.parent));
  const shorthandValues = world.shorthandValues(shorthand.map(({ key }) => key.parent));
  const plainValues = world.symbolsAt(plain.map(({ value }) => value));
  return {
    bindings: answers.flatMap(({ own, members, read }, at) => {
      const binding = bindings[at] as DerivedBinding;
      const reads = (readers[at] ?? []).flatMap((reader, index) => ((read[index] ?? []).some((key) => own.includes(key)) ? [world.siteOf(reader)] : []));
      return own.length === 0 || members.length === 0
        ? []
        : [
            {
              members,
              reads,
              initializer: initializers[at] ?? [],
              callee: callees[at] ?? [],
              index: binding.index,
            },
          ];
    }),
    supplies: supplies.map(({ index }, at) => ({ callee: keysOf([supplyCallees[at]]), index, value: keysOf([supplyValues[at]]) })),
    writes: [
      ...shorthand.map(({ members }, at) => ({ value: keysOf([shorthandValues[at]]), members })),
      ...plain.map(({ members }, at) => ({ value: keysOf([plainValues[at]]), members })),
    ],
  };
}

// The reads of every derived binding whose value some production path takes from its member: a variable initialized
// with, or a parameter handed at any call, an identifier the code also writes into that member.
function derivedCredits(facts: readonly DerivedFacts[]): PropertyFacts["credits"] {
  const holds = new Map<string, Set<string>>();
  for (const { value, members } of facts.flatMap((part) => part.writes)) {
    for (const key of value) {
      holds.set(key, new Set([...(holds.get(key) ?? []), ...members]));
    }
  }
  const supplied = new Map<string, (readonly string[])[]>();
  for (const { callee, index, value } of facts.flatMap((part) => part.supplies)) {
    for (const key of callee) {
      supplied.set(`${key}#${index}`, [...(supplied.get(`${key}#${index}`) ?? []), value]);
    }
  }
  return facts.flatMap((part) =>
    part.bindings.flatMap(({ members, reads, initializer, callee, index }) => {
      const values = [initializer, ...callee.flatMap((key) => supplied.get(`${key}#${index}`) ?? [])];
      const carried = values.some((value) => value.some((key) => members.some((member) => holds.get(key)?.has(member) === true)));
      return carried ? reads.map((site) => ({ site, keys: members })) : [];
    }),
  );
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
  /** The library, logger or call that receives it, when the scan can name one. */
  readonly receiver: string | null;
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
  /** The {@link siteKey} of every site where a library writes the members it credits, though its syntax reads. */
  readonly filled: ReadonlySet<string>;
  /** The role of every string key outside a property position, by {@link siteKey}: syntax alone types it as no reference. */
  readonly keyed: ReadonlyMap<string, SyntaxRole>;
  /** Every key the resolver could not place, with its reason. */
  readonly unresolved: readonly UnresolvedKey[];
  /** Each declaration key's flows: the keys its value is carried into. */
  readonly carriesInto: ReadonlyMap<string, ReadonlySet<string>>;
}

/** A key no resolver step placed. */
interface UnresolvedKey {
  readonly site: Site;
  readonly name: string;
  readonly reason: UnresolvedReason;
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
  /** The {@link siteKey} of every site where a library writes the members it credits, though its syntax reads. */
  readonly filled: ReadonlySet<string>;
  readonly keyed: ReadonlyMap<string, SyntaxRole>;
  readonly unresolved: readonly UnresolvedKey[];
  readonly derived: DerivedFacts;
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

// `TABLE satisfies Record<Task, Def>` on a bound value: the compiler holds each member of the value to the checked
// type's member of that name, nested members too, so a read of a row's member is a read of `Def`'s. A literal under
// `satisfies` already links through its contextual type.
const SATISFIED_DEPTH = 3;

function* satisfiedLinks(checker: Checker, value: Type, checked: Type, depth: number): APIRequestGenerator<readonly Link[]> {
  if (depth > SATISFIED_DEPTH || value.id === checked.id) {
    return [];
  }
  const properties = (yield* all(...(yield* constituents(value)).map((type) => checker.getPropertiesOfType.gen(type)))).flat();
  const named = yield* all(...properties.map((property) => propertiesNamed(checker, checked, property.name)));
  const links: Link[] = [];
  const pairs: { readonly own: NativeSymbol; readonly into: NativeSymbol }[] = [];
  for (const [at, property] of properties.entries()) {
    const into = (named[at] ?? []).filter((member) => member !== undefined);
    const to = keysOf(into);
    if (to.length > 0) {
      links.push({ from: declarationKeys(property), to });
    }
    pairs.push(...into.map((member) => ({ own: property, into: member })));
  }
  const nested = yield* all(
    ...pairs.map(function* ({ own, into }): APIRequestGenerator<readonly Link[]> {
      const [from, to] = yield* all(checker.getTypeOfSymbol.gen(own), checker.getTypeOfSymbol.gen(into));
      return yield* satisfiedLinks(checker, yield* checker.getNonNullableType.gen(from), yield* checker.getNonNullableType.gen(to), depth + 1);
    }),
  );
  return [...links, ...nested.flat()];
}

// A `satisfies` whose value is a bound name, through parentheses and assertions such as `as const`.
function satisfiedNames(node: Node): readonly { readonly value: Node; readonly checked: TypeNode }[] {
  return isSatisfiesExpression(node) && suppliedName(node.expression) !== null ? [{ value: node.expression, checked: node.type }] : [];
}

// `trpc.x.list.infiniteQueryOptions(input, { getNextPageParam })`: TanStack Query fills the procedure input's cursor from
// `getNextPageParam` on every page it fetches, so the call writes that member though no caller names it.
const PAGED_QUERY = "infiniteQueryOptions";
const PAGE_CURSOR = "cursor";

// The callee name of a paged-query call, the site its cursor write is credited at.
function pagedInputs(node: Node): readonly Node[] {
  return isCallExpression(node) && isPropertyAccessExpression(node.expression) && node.expression.name.text === PAGED_QUERY && node.arguments.length > 0
    ? [node.expression.name]
    : [];
}

function pagedCursors(world: NativeWorld, callees: readonly Node[]): readonly { readonly site: Site; readonly keys: readonly string[] }[] {
  const asked = callees.flatMap((callee) => {
    const [input] = (callee.parent.parent as CallExpression).arguments;
    return input === undefined ? [] : [{ key: PAGE_CURSOR, holder: input, at: callee }];
  });
  return resolveKeys(world, asked).flatMap((resolution, at) => {
    const keys = keysOfResolution(resolution);
    const callee = asked[at]?.at;
    return keys.length === 0 || callee === undefined ? [] : [{ site: world.siteOf(callee), keys }];
  });
}

const keysOfResolution = (resolution: KeyResolution | null): readonly string[] =>
  resolution?.outcome === "members" ? resolution.members.flatMap(declarationKeys) : [];

/** Every property site of a world resolved to the property declarations it means. A spread, computed key, `for…in`
 *  or reflective call credits its value expression's site to each property it reads. */
export function propertyIndex(world: NativeWorld): ReferenceIndex {
  return joinFacts([propertyFacts(world)]).index;
}

/** The unjoined facts of a world's `home` files. */
export function propertyFacts(world: NativeWorld, home: ReadonlySet<string> = everyFile(world)): PropertyFacts {
  const names: PropertyName[] = [];
  const extending: InterfaceDeclaration[] = [];
  const reflections: (Reflection & { readonly site: Site })[] = [];
  const indexed: { readonly member: Node; readonly owner: Node; readonly name: string }[] = [];
  const implementations: Signature[] = [];
  const bindings: DerivedBinding[] = [];
  const supplies: Supply[] = [];
  const callees = derivedCallees(world);
  const satisfied: { readonly value: Node; readonly checked: TypeNode }[] = [];
  const pagedCalls: Node[] = [];
  const written = new Set<string>();
  const stores: StoreWrite[] = [];
  const definitions: { readonly file: string; readonly start: number; readonly end: number }[] = [];
  const columnNames: Node[] = [];
  walk(world, home, (node) => {
    if (isPropertyName(node)) {
      names.push(node);
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
    const binding = derivedBinding(node);
    if (binding !== null) {
      bindings.push(binding);
    }
    supplies.push(...suppliesAt(node, callees));
    if (isFunctionDeclaration(node) && node.body !== undefined && node.name !== undefined) {
      implementations.push(node as Signature);
    }
    if (isInterfaceDeclaration(node) && node.heritageClauses !== undefined) {
      extending.push(node);
    }
    satisfied.push(...satisfiedNames(node));
    pagedCalls.push(...pagedInputs(node));
  });
  const { checker } = world;
  const resolutions = resolveKeys(
    world,
    names.map((node) => ({ node })),
  ).flatMap((resolution, at) => (resolution === null ? [] : [{ resolution, node: names[at] as PropertyName }]));
  for (const key of writtenKeys(resolutions)) {
    written.add(key);
  }
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
  const satisfies = world.batch(
    satisfied.map(function* ({ value, checked }): APIRequestGenerator<readonly Link[]> {
      const [own, held] = yield* all(checker.getTypeAtLocation.gen(value), checker.getTypeFromTypeNode.gen(checked));
      return yield* satisfiedLinks(checker, own, held, 0);
    }),
  );
  const handoffs = handoffFlows(world, home);
  const credits: { readonly site: Site; readonly keys: readonly string[] }[] = [...stored.credits, ...handoffs.reads];
  const links: Link[] = [...derived, ...overloaded.flat(), ...redeclared.flat(), ...satisfies.flat()];
  const flows: Flow[] = [...handoffs.flows, ...stored.flows];
  const sends: PropertyFacts["sends"][number][] = [...stored.sends];
  for (const { resolution } of resolutions) {
    const { site, own } = resolution;
    const keys = keysOfResolution(resolution);
    const column = stored.copied.get(siteKey(site));
    if (column !== undefined) {
      flows.push({ source: keys, sink: column });
      sends.push({ site, destination: "column", receiver: null, keys });
    } else if (!stored.defines(site, keys)) {
      credits.push({ site, keys });
    }
    if (own !== undefined) {
      // An uncontextual literal's key is its own declaration, and the write a later hand-off carries on.
      credits.push({ site, keys: declarationKeys(own) });
      links.push({ from: declarationKeys(own), to: keys });
    }
  }
  const sentReflections = kept.filter((reflection) => reflection.sent !== null);
  const sentKeys = world.batch(sentReflections.map((reflection) => heldMembers(world, reflection.value)));
  for (const [at, reflection] of sentReflections.entries()) {
    sends.push({ site: reflection.site, destination: reflection.sent as SendDestination, receiver: null, keys: sentKeys[at] ?? [] });
  }
  const openKeys = resolutions.flatMap(({ resolution, node }) => (resolution.outcome === "open" && isObjectLiteralKey(node) ? [valueOfKey(node)] : []));
  const literalReads = resolutions.flatMap(({ resolution, node }) => {
    const { parent } = node;
    const unnamed =
      isElementAccessExpression(parent) &&
      parent.argumentExpression === node &&
      (resolution.outcome === "open" || (resolution.outcome === "unresolved" && resolution.reason !== "synthetic"));
    return unnamed ? [{ site: resolution.site, receiver: parent.expression, name: node.text }] : [];
  });
  const open = openFacts(world, home, [...openKeys, ...openSpreads(world, kept)], literalReads);
  sends.push(...open.sends);
  credits.push(...open.reads, ...nestedReads(world, kept));
  const reflectedFacts = reflectionFacts(kept, reads);
  credits.push(...reflectedFacts.credits);
  links.push(...reflectedFacts.links);
  flows.push(...reflectedFacts.flows);
  const keyWrites = resolutions.flatMap(({ resolution, node }) => (isObjectLiteralKey(node) ? [{ key: node, members: keysOfResolution(resolution) }] : []));
  const keyed = new Map(
    resolutions.flatMap(({ resolution }) => (resolution.slotRole === null ? [] : [[siteKey(resolution.site), resolution.slotRole] as const])),
  );
  const unresolved = resolutions.flatMap(({ resolution }) =>
    resolution.outcome === "unresolved" ? [{ site: resolution.site, name: resolution.name, reason: resolution.reason }] : [],
  );
  const paged = pagedCursors(world, pagedCalls);
  const filled = new Set(paged.map(({ site }) => siteKey(site)));
  return {
    credits: [...credits, ...paged],
    links,
    flows,
    written: new Set([...written, ...filled]),
    sends,
    copied: new Set(stored.copied.keys()),
    filled,
    keyed,
    unresolved,
    derived: derivedFacts(world, bindings, supplies, keyWrites),
  };
}

// What the reflections credit: each read, and their links and flows.
function reflectionFacts(
  kept: readonly (Reflection & { readonly site: Site })[],
  reads: readonly Reflected[],
): Pick<PropertyFacts, "credits" | "links" | "flows"> {
  const credits: PropertyFacts["credits"][number][] = [];
  const links: Link[] = [];
  const flows: Flow[] = [];
  for (const [at, reflection] of kept.entries()) {
    const { reads: symbols, links: spread, flows: carried } = reads[at] ?? { reads: [], links: [], flows: [] };
    if (reflection.sent === null) {
      credits.push({ site: reflection.site, keys: keysOf(symbols) });
    }
    links.push(...spread);
    flows.push(...carried);
  }
  return { credits, links, flows };
}

// The sites of the resolved names that store into their member.
const writtenKeys = (resolutions: readonly { readonly resolution: KeyResolution; readonly node: PropertyName }[]): readonly string[] =>
  resolutions.flatMap(({ resolution, node }) => (isWrittenName(node) || resolution.slotRole === "write" ? [siteKey(resolution.site)] : []));

// An object literal's own key or shorthand, which a contextual type gives its member.
const isObjectLiteralKey = (node: Node): boolean => isNamedMember(node.parent, node) && isObjectLiteralExpression(node.parent.parent);

// The value an object literal key or shorthand puts in its slot.
function valueOfKey(key: Node): Node {
  const { parent } = key;
  return isPropertyAssignment(parent) ? parent.initializer : key;
}

// A spread into a literal whose type names no member hands its whole value to that slot.
function openSpreads(world: NativeWorld, kept: readonly (Reflection & { readonly site: Site })[]): readonly Node[] {
  const spreads = kept.filter((reflection) => reflection.sent === null && spreadTarget(reflection.value) !== null);
  const open = world.batch(
    spreads.map(function* (reflection): APIRequestGenerator<boolean> {
      const target = yield* world.checker.getContextualType.gen(spreadTarget(reflection.value) as Expression);
      return target !== undefined && (yield* isOpenType(world.checker, target));
    }),
  );
  return spreads.filter((_, at) => open[at] === true).map((reflection) => reflection.value);
}

// A dotted-path read may reach any nested member of its value, so it reads them all.
function nestedReads(world: NativeWorld, kept: readonly (Reflection & { readonly site: Site })[]): PropertyFacts["credits"] {
  const nested = kept.filter((reflection) => reflection.nested === true);
  const keys = world.batch(nested.map((reflection) => heldMembers(world, reflection.value)));
  return nested.map((reflection, at) => ({ site: reflection.site, keys: keys[at] ?? [] }));
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
      return store.flows.map(({ source }) => ({ site, destination: "column" as const, receiver: null, keys: source }));
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
  for (const { site, destination, receiver, keys } of facts.flatMap((part) => part.sends)) {
    for (const key of keys) {
      add(key, [{ site, destination, receiver }]);
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

/** Construction inventories need only the writes and their typed hand-offs after a world closes. */
export function constructionWrites(world: NativeWorld, home: ReadonlySet<string>): Pick<PropertyFacts, "credits" | "flows"> {
  const { credits, flows, written } = propertyFacts(world, home);
  return { credits: credits.filter(({ site, keys }) => keys.length > 0 && written.has(siteKey(site))), flows };
}

/** Carry each construction's writes to the shape an assignment, return or call delivers it into. */
export function joinConstructionWrites(parts: readonly ReturnType<typeof constructionWrites>[]): ReferenceIndex {
  const index = new Map<string, Site[]>();
  for (const part of parts) {
    for (const { site, keys } of part.credits) {
      credit(index, keys, site);
    }
  }
  const { down } = flowEdges(parts.flatMap((part) => part.flows));
  return withCarried(
    index,
    carriedAlong(index, down, () => true),
  );
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
  for (const { site, keys } of derivedCredits(facts.map((part) => part.derived))) {
    credit(index, keys, site);
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
    filled: new Set(facts.flatMap((part) => [...part.filled])),
    keyed: new Map(facts.flatMap((part) => [...part.keyed])),
    unresolved: [...new Map(facts.flatMap((part) => part.unresolved).map((key) => [siteKey(key.site), key])).values()],
    carriesInto: down,
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
