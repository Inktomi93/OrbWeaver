// Which tuples a string literal's slot takes its vocabulary from, read off what its declaration spells on the 7.1 tree of
// the graph session's merged program: a type annotation, or the schema value a type is inferred from. Types cannot
// say: a one-member union, an `Exclude` and a re-spelled subset all hold the same literals as the tuple.
//
// - A slot names a tuple only through a declaration that traces to it: a type node followed through aliases,
//   references and instantiations to `(typeof T)[number]`. A type never names a tuple by itself: TS7 keeps no alias for
//   that idiom, and a union holding a tuple's members may be a re-spelling or a coincidence. A slot no declaration
//   traces names no tuple.
// - A declaration is read only in a product file. A library's parameter is read off its declared type with its type
//   parameters bound to the nodes that instantiate them: the call's explicit type arguments, the declared type of the
//   argument a parameter is inferred from, and a method receiver's declared type arguments.
// - A type parameter is read through what instantiates it: a call's explicit type argument, the declared type of the
//   argument it is inferred from, or its constraint when that names exactly one tuple; a type reference's written
//   argument or default, including a receiver's annotation. An instantiating type is never matched to a default or a
//   constraint by identity: two unions of the same members are one type. A type parameter that indexes an indexed
//   access selects the property its string-literal argument names. One nothing instantiates leaves the slot unreadable.
// - A literal inside array literals is read at its position: an array type or a tuple type selects the element type at
//   each index, a Map's entries are a key and a value, and a type that cannot select (a conditional, a mapped type) is
//   read whole. A callback handed to a library parameter returns what that parameter's callback type returns
//   (`setState((prev) => next)`). A library member (`ref.current`) is read off its declared type under the receiver's
//   type arguments, written in its annotation or spelled by the call that made it.
// - An indexed access selects the properties its index spells: a literal, a union of them, an alias of either, or a type
//   parameter whose argument is a literal, a union of them or a variable annotated with one. A property no written type
//   names (`z.output<typeof schema>["p"]`, `Awaited<ReturnType<F>>[number]["p"]`) is read by the declaration the checker
//   finds on the type the access denotes. A shorthand property hands its constant on to the property it names.
// - A property of a mapped type a product file declares is the type's template, with the mapped key bound to the
//   property's name; a library's mapped type (`Partial`, `Readonly`) keeps the declarations of the properties it maps. A
//   type argument that is a literal selects properties and spells no vocabulary, and a type argument that is a key
//   hands its keys on to the parameter it instantiates.
// - A `new Map(...)` or `new Set(...)` without type arguments takes each type parameter from the type argument at the same
//   position in the annotation it is assigned to; the written argument is the trace, never the type it equals.
// - A property of an object an inferred generic call takes is read by descending the callee's written parameter type to
//   the member (`writtenPath`), so a reference that leaves a type argument to its default reads the default's node.
// - Remote nodes are materialised per request, so a declaration a symbol names is read back as its site and found
//   again in the world's own parse of its file, and a walk keys what it has seen by span and kind, never by identity.
import type {
  ArrayLiteralExpression,
  ArrowFunction,
  AsExpression,
  BindingElement,
  CallExpression,
  ConstructorDeclaration,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  FunctionTypeNode,
  GetAccessorDeclaration,
  Identifier,
  IndexedAccessTypeNode,
  JsxAttribute,
  MethodDeclaration,
  MethodSignatureDeclaration,
  NewExpression,
  Node,
  ObjectLiteralExpression,
  ParameterDeclaration,
  PropertyAccessExpression,
  PropertyAssignment,
  PropertyName,
  SetAccessorDeclaration,
  ShorthandPropertyAssignment,
  Statement,
  TupleTypeNode,
  TypeAliasDeclaration,
  TypeNode,
  TypeParameterDeclaration,
  TypeReferenceNode,
  VariableDeclaration,
} from "@typescript/native/ast";
import {
  getNameOfDeclaration,
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isArrayTypeNode,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isCaseClause,
  isClassDeclaration,
  isComputedPropertyName,
  isConditionalExpression,
  isConstructorDeclaration,
  isDefaultClause,
  isElementAccessExpression,
  isEnumMember,
  isExpressionWithTypeArguments,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isGetAccessorDeclaration,
  isIdentifier,
  isIndexedAccessTypeNode,
  isInferTypeNode,
  isInterfaceDeclaration,
  isIntersectionTypeNode,
  isJsxAttribute,
  isJsxAttributes,
  isJsxExpression,
  isLiteralTypeNode,
  isMappedTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNamedTupleMember,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isOptionalTypeNode,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isRestTypeNode,
  isReturnStatement,
  isSatisfiesExpression,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isSwitchStatement,
  isTemplateSpan,
  isTupleTypeNode,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeNode,
  isTypeOperatorNode,
  isTypeParameterDeclaration,
  isTypePredicateNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  isVariableStatement,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Signature, Type, TypeParameter, TypeReference } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { Site } from "../classify.ts";
import type { NativeWorld } from "../native.ts";
import { constituents, hasFlag } from "../native.ts";
import type { LiteralRole } from "./roles.ts";
import { sameNode } from "./roles.ts";
import { productReader } from "./state.ts";

/** What a slot's spellings reach: the tuples, as `file:NAME` keys, and the string literal types written on the way,
 *  each site key to its text. A literal type that re-spells a tuple member belongs to the tuple only where the scan
 *  links the two: the tuple `satisfies` a type that reaches it, or a value typed by it feeds the tuple's slot. */
export interface Spelled {
  readonly tuples: ReadonlySet<string>;
  readonly literals: ReadonlyMap<string, string>;
}

/** A slot's {@link Spelled} vocabulary; null when no declaration traces the slot to the end, so it names no tuple. */
export type Origins = Spelled | null;

// What instantiates a type parameter: the spellings it stands for, and, where it indexes an indexed access, the
// property it selects (`Settings[K]` at a call whose `key: K` argument is `"theme"`).
interface Binding {
  /** What the parameter stands for; null for a literal key, which selects properties and spells no vocabulary. */
  readonly spellings: readonly Spelling[] | null;
  readonly index: readonly string[] | null;
}

// Type parameters' instantiations, keyed by the site of each parameter's name.
type Bindings = ReadonlyMap<string, Binding>;

// Where a literal sits in the array literals it is written in, outermost first: the index in each, null where a spread
// before it makes the index unknown. `[["a", "b"]]` puts "b" at [0, 1].
type Position = number | null;
type Positions = readonly Position[];

const NO_POSITIONS: Positions = [];

// A node a slot is spelled by, with the instantiations of the type parameters it is read under. `positions` is where the
// literal sits inside the array literals that reach the slot: the slot's own array or tuple type selects its element at
// each, and a type that cannot select reads whole, a library container's type argument then being its slot.
interface Spelling {
  readonly node: Node;
  readonly bindings: Bindings;
  readonly positions?: Positions;
}

const isNested = (positions: Positions | undefined): boolean => positions !== undefined && positions.length > 0;

const NO_BINDINGS: Bindings = new Map();

const bindingOf = (spellings: readonly Spelling[]): Binding => ({ spellings, index: null });

// A type walk's type parameters, by type id, bound to the nodes that instantiate them.
type TypeBindings = ReadonlyMap<number, readonly Spelling[]>;

const NO_TYPE_BINDINGS: TypeBindings = new Map();

const unbound = (node: Node): Spelling => ({ node, bindings: NO_BINDINGS });

const siteKey = (site: Site): string => `${site.file}:${String(site.position)}`;

const merged = (...parts: readonly Bindings[]): Bindings => new Map(parts.flatMap((bindings) => [...bindings]));

/** No tuple and no literal type. */
export const NOTHING_SPELLED: Spelled = { tuples: new Set(), literals: new Map() };

const CONST_ASSERTION = "const";

/** The innermost node whose own text starts at `site`, in the world's parse of its file; a string literal's site may
 *  start inside its quote. Undefined when no node starts there or the world holds no such file. */
function nodeAt(world: NativeWorld, site: Site): Node | undefined {
  const source = world.source(site.file);
  if (source === undefined) {
    return undefined;
  }
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (site.position >= node.getStart(source) && site.position < node.getEnd()) {
      found = node;
      node.forEachChild(visit);
    }
  };
  source.forEachChild(visit);
  const start = found?.getStart(source);
  const quoted = found !== undefined && (isStringLiteral(found) || isNoSubstitutionTemplateLiteral(found)) && start === site.position - 1;
  return start === site.position || quoted ? found : undefined;
}

/** The key a walk records a node under: remote nodes compare by span and kind, never by identity. */
export const nodeKey = (node: Node): string => `${node.getSourceFile().fileName}:${String(node.pos)}:${String(node.end)}:${String(node.kind)}`;

// A declaration with a signature: what a `return` reads its slot from, and what a type guard binds its parameter in.
type Signed =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | MethodDeclaration
  | MethodSignatureDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration
  | ConstructorDeclaration
  | FunctionTypeNode;

const isSigned = (node: Node): node is Signed =>
  isFunctionDeclaration(node) ||
  isFunctionExpression(node) ||
  isArrowFunction(node) ||
  isMethodDeclaration(node) ||
  isMethodSignatureDeclaration(node) ||
  isGetAccessorDeclaration(node) ||
  isSetAccessorDeclaration(node) ||
  isConstructorDeclaration(node) ||
  isFunctionTypeNode(node);

function* targetOf(checker: Checker, symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
    return symbol;
  }
  const target = yield* checker.getAliasedSymbol.gen(symbol);
  return (yield* checker.isUnknownSymbol.gen(target)) ? undefined : target;
}

// The sites of a symbol's declaration names.
function* symbolSites(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<readonly Site[]> {
  const nodes = symbol === undefined ? [] : yield* all(...symbol.declarations.map((handle) => handle.resolve.gen()));
  return nodes.flatMap((node) => (node === undefined ? [] : [world.siteOf(getNameOfDeclaration(node) ?? node)]));
}

/** Where the symbol a name resolves to is declared, by each declaration's name site, import aliases followed. */
export function* declaredSites(world: NativeWorld, name: Node): APIRequestGenerator<readonly Site[]> {
  const symbol = yield* world.checker.getSymbolAtLocation.gen(name);
  return yield* symbolSites(world, yield* targetOf(world.checker, symbol));
}

// The call a node is an argument of, and its index.
interface Argument {
  readonly call: CallExpression | NewExpression;
  readonly index: number;
}

function argumentOf(node: Node): Argument | undefined {
  const { parent } = node;
  if (!(isCallExpression(parent) || isNewExpression(parent))) {
    return undefined;
  }
  const index = parent.arguments?.findIndex((argument) => sameNode(argument, node)) ?? -1;
  return index < 0 ? undefined : { call: parent, index };
}

/** The declaration names the symbol a name resolves to has, import aliases followed, each found in the world's own
 *  parse of its file; a declaration outside the world's sources (a library) is left out. */
export function* declarationsOf(world: NativeWorld, name: Node): APIRequestGenerator<readonly Node[]> {
  return (yield* declaredSites(world, name)).flatMap((site) => nodeAt(world, site) ?? []);
}

// The parameter the signature chosen for a call argument binds it to, by its name's site; a rest parameter takes every
// argument past the last.
function* parameterOf(world: NativeWorld, argument: Node): APIRequestGenerator<Site | null> {
  const found = argumentOf(argument);
  if (found === undefined) {
    return null;
  }
  const parameters = yield* (yield* world.checker.getResolvedSignature.gen(found.call)).getParameters.gen();
  const bound = parameters[Math.min(found.index, parameters.length - 1)];
  return (yield* symbolSites(world, bound))[0] ?? null;
}

/** The parameter declaration the signature chosen for a call argument binds it to, in the world's own parse of its
 *  file; a rest parameter takes every argument past the last. Undefined for a library's parameter. */
export function* boundParameter(world: NativeWorld, argument: Node): APIRequestGenerator<ParameterDeclaration | undefined> {
  const site = yield* parameterOf(world, argument);
  const parent = site === null ? undefined : nodeAt(world, site)?.parent;
  return parent !== undefined && isParameterDeclaration(parent) ? parent : undefined;
}

// The declarations of a property, by their name sites, and the types it was found on, whose instantiations bind the
// type parameters its declarations are spelled with.
interface FoundProperty {
  readonly sites: readonly Site[];
  readonly owners: readonly Type[];
  /** Where a product mapped type declares the property, which retypes it: the template, with its key bound. */
  readonly templates: readonly Template[];
}

interface Template {
  readonly node: TypeNode;
  readonly bindings: Bindings;
}

function* propertyOn(world: NativeWorld, types: readonly Type[], name: string): APIRequestGenerator<FoundProperty> {
  const properties = yield* all(...types.map((type) => world.checker.getPropertyOfType.gen(type, name)));
  const owners = types.filter((_, at) => properties[at] !== undefined);
  const mapped = yield* all(...types.map((type, at) => mappedTemplate(world, type, properties[at], name)));
  const sites = yield* all(...properties.map((property, at) => symbolSites(world, mapped[at] === undefined ? property : undefined)));
  return { sites: sites.flat(), owners, templates: mapped.flatMap((template) => template ?? []) };
}

// The template of a mapped type a product file declares, as it types a property it has: the template's key is bound to the
// property's name. A library's mapped type keeps the declarations of the properties it maps, and one with an `as` clause
// renames them.
function* mappedTemplate(world: NativeWorld, type: Type, property: NativeSymbol | undefined, name: string): APIRequestGenerator<Template | undefined> {
  if (property === undefined || !type.isMappedType()) {
    return undefined;
  }
  const sites = yield* symbolSites(world, yield* type.getSymbol.gen());
  const node = sites.flatMap((site) => (productReader(site.file) ? (nodeAt(world, site) ?? []) : [])).find(isMappedTypeNode);
  if (node === undefined || node.type === undefined || node.nameType !== undefined) {
    return undefined;
  }
  return { node: node.type, bindings: new Map([[siteKey(world.siteOf(node.typeParameter.name)), { spellings: [], index: [name] }]]) };
}

// The declarations of property `name` in the contextual type of an object literal.
function* propertiesOf(world: NativeWorld, object: ObjectLiteralExpression, name: string): APIRequestGenerator<FoundProperty> {
  const type = yield* world.checker.getContextualType.gen(object);
  return yield* propertyOn(world, type === undefined ? [] : yield* constituents(type), name);
}

// The spellings a library-declared type is written from, read through what instantiates its type parameters: a bound
// type parameter is its nodes, a product alias its declaration, and a union, an intersection or a library alias its
// parts. A library interface or class is its type arguments only for an element, since a literal is no instance of it.
// A string literal type is null: only a declaration can name a tuple. Any other object type holds no string literal.
function* typeSpellings(world: NativeWorld, type: Type, bound: TypeBindings, positions: Positions): APIRequestGenerator<Declared> {
  if (type.isTypeParameter()) {
    const spelled = type.isThisType === true ? [] : bound.get(type.id);
    return spelled === undefined ? null : spelled.map((spelling) => (isNested(positions) ? { ...spelling, positions } : spelling));
  }
  if (type.isStringLiteralType()) {
    return null;
  }
  const alias = yield* type.getAliasSymbol.gen();
  if (alias !== undefined) {
    const parts = yield* type.getAliasTypeArguments.gen();
    const declaration = yield* aliasDeclaration(world, alias);
    return declaration === undefined
      ? yield* partSpellings(world, parts, bound, positions)
      : [{ node: declaration.type, bindings: yield* parameterBindings(world, declaration.typeParameters ?? [], parts, bound), positions }];
  }
  if (type.isUnionType() || type.isIntersectionType()) {
    return yield* partSpellings(world, yield* type.getTypes.gen(), bound, positions);
  }
  return isNested(positions) && type.isTypeReference() ? yield* elementSpellings(world, type, bound, positions) : [];
}

// A library array, tuple or container reference a literal sits in: the type argument its first position selects, else
// them all. A product interface or class holds no such element.
function* elementSpellings(world: NativeWorld, type: TypeReference, bound: TypeBindings, [at, ...inner]: Positions): APIRequestGenerator<Declared> {
  const parts = yield* world.checker.getTypeArguments.gen(type);
  if (yield* world.checker.isTupleType.gen(type)) {
    const chosen = at === null || at === undefined ? parts : [parts[Math.min(at, parts.length - 1)]];
    return yield* partSpellings(
      world,
      chosen.filter((part) => part !== undefined),
      bound,
      inner,
    );
  }
  const target = yield* (yield* type.getTarget.gen()).getSymbol.gen();
  const owned = (yield* symbolSites(world, target)).some((site) => productReader(site.file));
  return owned ? [] : yield* partSpellings(world, parts, bound, inner);
}

function* partSpellings(world: NativeWorld, parts: readonly Type[], bound: TypeBindings, positions: Positions): APIRequestGenerator<Declared> {
  const spelled: Spelling[] = [];
  for (const part of parts) {
    const spellings = yield* typeSpellings(world, part, bound, positions);
    if (spellings === null) {
      return null;
    }
    spelled.push(...spellings);
  }
  return spelled;
}

// The property names a type spells: a string literal type or a union of them.
function* typeKeys(type: Type): APIRequestGenerator<readonly string[] | null> {
  const members = type.isUnionType() ? yield* type.getTypes.gen() : [type];
  const keys = members.map((member) => (member.isStringLiteralType() ? member.value : null));
  return keys.every((key) => key !== null) ? keys : null;
}

// What an instantiating type binds its parameter to: the nodes it is written from, or, for a literal key, the properties
// it selects.
function* argumentBinding(world: NativeWorld, part: Type, bound: TypeBindings): APIRequestGenerator<Binding | undefined> {
  const spelled = yield* typeSpellings(world, part, bound, NO_POSITIONS);
  if (spelled !== null) {
    return bindingOf(spelled);
  }
  const keys = yield* typeKeys(part);
  return keys === null ? undefined : { spellings: null, index: keys };
}

// Type parameter declarations bound to what the types an instantiation gives them are written from; a part no
// declaration traces is left unbound.
function* parameterBindings(
  world: NativeWorld,
  parameters: readonly TypeParameterDeclaration[],
  parts: readonly Type[],
  bound: TypeBindings,
): APIRequestGenerator<Bindings> {
  const bindings = new Map<string, Binding>();
  for (const [at, parameter] of parameters.entries()) {
    const part = parts[at];
    const binding = part === undefined ? undefined : yield* argumentBinding(world, part, bound);
    if (binding !== undefined) {
      bindings.set(siteKey(world.siteOf(parameter.name)), binding);
    }
  }
  return bindings;
}

// The type parameters a type instantiates: a type reference's target's, bound to its type arguments, and a product
// alias's, bound to the alias's type arguments.
function* instanceBindings(world: NativeWorld, type: Type): APIRequestGenerator<Bindings> {
  const alias = yield* type.getAliasSymbol.gen();
  const declaration = alias === undefined ? undefined : yield* aliasDeclaration(world, alias);
  const aliased =
    declaration === undefined
      ? NO_BINDINGS
      : yield* parameterBindings(world, declaration.typeParameters ?? [], yield* type.getAliasTypeArguments.gen(), NO_TYPE_BINDINGS);
  return type.isTypeReference() ? merged(yield* referenceBindings(world, type), aliased) : aliased;
}

function* referenceBindings(world: NativeWorld, type: TypeReference): APIRequestGenerator<Bindings> {
  const bindings = new Map<string, Binding>();
  const parameters = yield* (yield* type.getTarget.gen()).getTypeParameters.gen();
  const parts = yield* world.checker.getTypeArguments.gen(type);
  for (const [at, parameter] of parameters.entries()) {
    const part = parts[at];
    const sites = yield* symbolSites(world, yield* parameter.getSymbol.gen());
    const binding = part === undefined ? undefined : yield* argumentBinding(world, part, NO_TYPE_BINDINGS);
    for (const site of binding === undefined ? [] : sites) {
      bindings.set(siteKey(site), binding ?? bindingOf([]));
    }
  }
  return bindings;
}

// The product declaration of a type alias; undefined for a library's.
function* aliasDeclaration(world: NativeWorld, alias: NativeSymbol): APIRequestGenerator<TypeAliasDeclaration | undefined> {
  const declaration = (yield* symbolSites(world, alias)).map((site) => declarationAt(world, site)).find((node) => node !== null);
  return declaration !== undefined && isTypeAliasDeclaration(declaration) ? declaration : undefined;
}

// The instantiations of the types a property was found on.
function* ownerBindings(world: NativeWorld, owners: readonly Type[]): APIRequestGenerator<Bindings> {
  return merged(...(yield* all(...owners.map((owner) => instanceBindings(world, owner)))));
}

// Types no string literal belongs to. A type parameter constrained to them takes a literal argument's own type, so the
// argument lands in no vocabulary but its own.
const LITERAL_FREE: readonly TypeFlags[] = [
  TypeFlags.String,
  TypeFlags.Number,
  TypeFlags.BigInt,
  TypeFlags.Boolean,
  TypeFlags.BooleanLiteral,
  TypeFlags.NumberLiteral,
  TypeFlags.BigIntLiteral,
  TypeFlags.ESSymbol,
  TypeFlags.Null,
  TypeFlags.Undefined,
];

const isLiteralFree = (flags: number): boolean => LITERAL_FREE.some((flag) => hasFlag(flags, flag));

const keyOf = (name: PropertyName): string | null => (isIdentifier(name) || isStringLiteral(name) ? name.text : null);

// What a call's argument at `index` is declared as in the generic signature the call resolves to, with that signature
// and its own type parameters; undefined when the call spells its type arguments or the signature declares none, since
// only an inferred type parameter can take its type from the argument.
interface Uninferred {
  readonly type: Type;
  readonly signature: Signature;
  readonly own: readonly Type[];
  /** The parameter symbol the argument binds to. */
  readonly parameter: NativeSymbol;
}

function* uninferredBinding(world: NativeWorld, { call, index }: Argument): APIRequestGenerator<Uninferred | undefined> {
  if (call.typeArguments !== undefined) {
    return undefined;
  }
  const signature = yield* (yield* world.checker.getResolvedSignature.gen(call)).getTarget.gen();
  const own = signature === undefined ? [] : yield* signature.getTypeParameters.gen();
  const parameters = signature === undefined ? [] : yield* signature.getParameters.gen();
  const bound = parameters[Math.min(index, parameters.length - 1)];
  return signature === undefined || own.length === 0 || bound === undefined
    ? undefined
    : { type: yield* world.checker.getTypeOfSymbol.gen(bound), signature, own, parameter: bound };
}

// Whether the call argument binds a parameter typed by one of the callee's own type parameters, inferred at this call,
// whose constraint holds no literal type: the parameter's type is then the argument's own, a vocabulary of none of the
// tuples.
function* infersFromArgument(world: NativeWorld, argument: Node): APIRequestGenerator<boolean> {
  const found = argumentOf(argument);
  const declared = found === undefined ? undefined : yield* uninferredBinding(world, found);
  if (declared === undefined || !declared.type.isTypeParameter() || !declared.own.some((parameter) => parameter.id === declared.type.id)) {
    return false;
  }
  const constraint = yield* world.checker.getConstraintOfTypeParameter.gen(declared.type);
  const members = constraint === undefined ? [] : yield* constituents(constraint);
  return members.every((member) => isLiteralFree(member.flags));
}

// The declared slot an object literal fills: the types its property path is read from, outermost property first.
interface DeclaredSlot {
  readonly types: readonly Type[];
  readonly path: readonly string[];
  /** The type node the product callee writes for the argument's parameter; absent for a callback's slot. */
  readonly written?: TypeNode | undefined;
}

// Climb from a value to the call argument it sits in, through parentheses, `as const`, property values and a callback's
// returned value, then read the argument's declared parameter type.
function* declaredSlot(world: NativeWorld, node: Node, path: readonly string[]): APIRequestGenerator<DeclaredSlot | undefined> {
  const { parent } = node;
  if (isParenthesizedExpression(parent) || isConstAssertion(parent)) {
    return yield* declaredSlot(world, parent, path);
  }
  if (isPropertyAssignment(parent) && sameNode(parent.initializer, node) && isObjectLiteralExpression(parent.parent)) {
    const key = keyOf(parent.name);
    return key === null ? undefined : yield* declaredSlot(world, parent.parent, [key, ...path]);
  }
  if (isArrowFunction(parent) && sameNode(parent.body, node)) {
    return yield* callbackSlot(world, parent, path);
  }
  const argument = argumentOf(node);
  const declared = argument === undefined ? undefined : yield* uninferredBinding(world, argument);
  return declared === undefined ? undefined : { types: [declared.type], path, written: yield* writtenParameterType(world, declared.parameter) };
}

// The type node a product callee writes for a parameter; undefined for a library's.
function* writtenParameterType(world: NativeWorld, parameter: NativeSymbol): APIRequestGenerator<TypeNode | undefined> {
  const [site] = yield* symbolSites(world, parameter);
  const declaration = site === undefined ? null : declarationAt(world, site);
  return declaration !== null && isParameterDeclaration(declaration) ? declaration.type : undefined;
}

// A callback's returned value: when the callee declares the callback to return one of its own type parameters and
// returns that parameter, or a list of it, the call's result holds only values the callback returned, since a generic
// function makes a value of its type parameter in no other way. The call's own contextual type is then the slot.
function* callbackSlot(world: NativeWorld, callback: Node, path: readonly string[]): APIRequestGenerator<DeclaredSlot | undefined> {
  const argument = argumentOf(callback);
  const declared = argument === undefined ? undefined : yield* uninferredBinding(world, argument);
  if (argument === undefined || declared === undefined) {
    return undefined;
  }
  const returns = yield* all(...(yield* declared.type.getCallSignatures.gen()).map((signature) => signature.getReturnType.gen()));
  const returned = returns.find((type) => type.isTypeParameter() && declared.own.some((parameter) => parameter.id === type.id));
  const result = yield* declared.signature.getReturnType.gen();
  const listed = returned !== undefined && (yield* elementTypes(world.checker, [result])).some((type) => type.id === returned.id);
  const holder = listed ? spreadInto(argument.call) : undefined;
  const context =
    returned === undefined || !(listed || result.id === returned.id) ? undefined : yield* world.checker.getContextualType.gen(holder ?? argument.call);
  if (context === undefined) {
    return undefined;
  }
  return { types: listed ? yield* elementTypes(world.checker, [context]) : [context], path };
}

// The array literal a list is spread into (`[...rows.map(...)]`): its contextual type is the list's, since a spread
// element's expression has none of its own.
function spreadInto(node: Node): ArrayLiteralExpression | undefined {
  const { parent } = node;
  return isSpreadElement(parent) && isArrayLiteralExpression(parent.parent) ? parent.parent : undefined;
}

// The element types of list types: each number index signature's value.
function* elementTypes(checker: Checker, types: readonly Type[]): APIRequestGenerator<readonly Type[]> {
  const elements: Type[] = [];
  for (const type of yield* settledTypes(checker, types)) {
    const indexes = yield* checker.getIndexInfosOfType.gen(type);
    elements.push(...indexes.filter((info) => hasFlag(info.keyType.flags, TypeFlags.Number)).map((info) => info.valueType));
  }
  return elements;
}

// Each type read as the object types a property is found on: a type parameter as its constraint, a union as its members.
function* settledTypes(checker: Checker, types: readonly Type[]): APIRequestGenerator<readonly Type[]> {
  const settled: Type[] = [];
  const pending = [...types];
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    if (type.isTypeParameter()) {
      const constraint = yield* checker.getConstraintOfTypeParameter.gen(type);
      pending.push(...(constraint === undefined ? [] : [constraint]));
    } else {
      const members = yield* constituents(type);
      if (members.length > 1) {
        pending.push(...members);
      } else {
        settled.push(type);
      }
    }
  }
  return settled;
}

// The types a property named `name` has on `types`, or a string index signature's value where the type has none.
function* propertyTypes(checker: Checker, types: readonly Type[], name: string): APIRequestGenerator<readonly Type[]> {
  const next: Type[] = [];
  for (const type of yield* settledTypes(checker, types)) {
    const property = yield* checker.getPropertyOfType.gen(type, name);
    if (property === undefined) {
      const indexes = yield* checker.getIndexInfosOfType.gen(type);
      next.push(...indexes.filter((info) => hasFlag(info.keyType.flags, TypeFlags.String)).map((info) => info.valueType));
    } else {
      next.push(yield* checker.getTypeOfSymbol.gen(property));
    }
  }
  return next;
}

// The declarations of property `name` in the slot an object literal fills inside a call argument, read from the
// callee's declared parameter type with its own type parameters at their constraints: what {@link propertiesOf} answers
// when the call did not infer the type from the object itself.
function* uninferredPropertiesOf(world: NativeWorld, slot: DeclaredSlot | undefined, name: string): APIRequestGenerator<FoundProperty> {
  if (slot === undefined) {
    return { sites: [], owners: [], templates: [] };
  }
  let { types } = slot;
  for (const step of slot.path) {
    types = yield* propertyTypes(world.checker, types, step);
  }
  return yield* propertyOn(world, yield* settledTypes(world.checker, types), name);
}

// What a slot's declaration spells: type annotations, or the value expression a schema-inferred property is written
// from, each with the type parameters it is read under.
type Declared = readonly Spelling[] | null;

/** The spellings read for one slot before it is called unreadable: a slot that reaches this many is a generated table or
 *  a whole schema, and ruling a tuple out of it would be a guess. */
const SPELLING_LIMIT = 2000;

// `as const`'s type.
const isConstType = (type: TypeNode): boolean => isTypeReferenceNode(type) && isIdentifier(type.typeName) && type.typeName.text === CONST_ASSERTION;

/** `x as const`. */
export const isConstAssertion = (node: Node): node is AsExpression => isAsExpression(node) && isConstType(node.type);

const PASSING_OPERATORS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken, SyntaxKind.AmpersandAmpersandToken]);

// The parent hands the value on whole, so the slot is the parent's.
function passesThrough(parent: Node, node: Node): boolean {
  return (
    isParenthesizedExpression(parent) ||
    isNonNullExpression(parent) ||
    isJsxExpression(parent) ||
    isArrayLiteralExpression(parent) ||
    (isConditionalExpression(parent) && !sameNode(parent.condition, node)) ||
    (isBinaryExpression(parent) && PASSING_OPERATORS.has(parent.operatorToken.kind)) ||
    (isAsExpression(parent) && isConstType(parent.type))
  );
}

// The function a `return` sits in.
function enclosingFunction(node: Node): Signed | undefined {
  for (let at = node.parent; !isSourceFile(at); at = at.parent) {
    if (isSigned(at)) {
      return at;
    }
  }
  return undefined;
}

// The annotation the parent spells for `node`, if the parent spells one.
function spelledFor(parent: Node, node: Node): TypeNode | undefined {
  if (isAsExpression(parent) || isSatisfiesExpression(parent)) {
    return parent.type;
  }
  if ((isVariableDeclaration(parent) || isParameterDeclaration(parent) || isPropertyDeclaration(parent)) && sameNode(parent.initializer, node)) {
    return parent.type;
  }
  if (isReturnStatement(parent)) {
    const fn = enclosingFunction(parent);
    return fn === undefined ? undefined : returnedType(fn, fn.type);
  }
  return isArrowFunction(parent) && sameNode(parent.body, node) ? returnedType(parent, parent.type) : undefined;
}

const PROMISE = "Promise";

const isAsync = (fn: Node): boolean =>
  (isFunctionDeclaration(fn) || isFunctionExpression(fn) || isArrowFunction(fn) || isMethodDeclaration(fn)) &&
  fn.modifiers?.some((modifier) => modifier.kind === SyntaxKind.AsyncKeyword) === true;

// The type a function's returned value lands in: its return type, or what the `Promise` it returns settles to when the
// function is async.
function returnedType(fn: Node, type: TypeNode | undefined): TypeNode | undefined {
  if (type === undefined || !isAsync(fn) || !isTypeReferenceNode(type) || !isIdentifier(type.typeName) || type.typeName.text !== PROMISE) {
    return type;
  }
  return type.typeArguments?.[0] ?? type;
}

function annotationOf(declaration: Node | null): TypeNode | undefined {
  const typed =
    declaration !== null &&
    (isParameterDeclaration(declaration) ||
      isVariableDeclaration(declaration) ||
      isPropertySignatureDeclaration(declaration) ||
      isPropertyDeclaration(declaration));
  return typed ? declaration.type : undefined;
}

// What a property's declaration spells: its annotation, or, when a schema shape declares it, the value it is written from.
function propertySpelling(declaration: Node): Node | undefined {
  if (isPropertyAssignment(declaration)) {
    return declaration.initializer;
  }
  return isShorthandPropertyAssignment(declaration) ? declaration.name : annotationOf(declaration);
}

// The declaration a name site belongs to, or null for one outside the production sources.
function declarationAt(world: NativeWorld, site: Site): Node | null {
  return productReader(site.file) ? (nodeAt(world, site)?.parent ?? null) : null;
}

function propertyName(name: PropertyName): string | null {
  return isIdentifier(name) || isStringLiteral(name) || isNoSubstitutionTemplateLiteral(name) ? name.text : null;
}

const declaresWithin = (world: NativeWorld, sites: readonly Site[], node: Node): boolean => {
  const at = world.siteOf(node);
  return sites.length > 0 && sites.every((site) => site.file === at.file && site.position >= at.position && site.position < node.getEnd());
};

// The spellings of the declarations of property `name` in the object's contextual type; undefined when it has none to
// read, so the object's own slot decides. A property the object itself declares is a type a generic call inferred from
// the object, so the callee's declared parameter is the slot when it has the property, and the object's own slot
// otherwise: the object's own value is never its slot.
function* propertySpellings(world: NativeWorld, name: string | null, object: ObjectLiteralExpression): APIRequestGenerator<Declared | undefined> {
  const none: FoundProperty = { sites: [], owners: [], templates: [] };
  const contextual = name === null ? none : yield* propertiesOf(world, object, name);
  const inferred = name !== null && declaresWithin(world, contextual.sites, object);
  // the callee's slot is climbed to once, for the written descent and for the checker's reading it falls back to
  const slot = inferred ? yield* declaredSlot(world, object, []) : undefined;
  const written = inferred ? yield* writtenSpellings(world, slot, name) : null;
  if (written !== null) {
    return written;
  }
  const found = inferred ? yield* uninferredPropertiesOf(world, slot, name) : contextual;
  const spellings: Node[] = [];
  for (const site of found.sites) {
    const declaration = declarationAt(world, site);
    if (declaration === null) {
      return null;
    }
    const spelling = propertySpelling(declaration);
    if (spelling !== undefined) {
      spellings.push(spelling);
    }
  }
  if (spellings.length === 0 && found.templates.length === 0) {
    return undefined;
  }
  const bindings = yield* ownerBindings(world, found.owners);
  return [
    ...spellings.map((node) => ({ node, bindings })),
    ...found.templates.map((template) => ({ node: template.node, bindings: merged(bindings, template.bindings) })),
  ];
}

// A parameter the call types by the argument itself spells no vocabulary: the argument builds nothing there. A
// parameter a library declares is read off its declared type.
function* parameterSpellings(world: NativeWorld, argument: Node, at: Climb): APIRequestGenerator<Declared> {
  const found = argumentOf(argument);
  if (found === undefined || (yield* infersFromArgument(world, argument))) {
    return found === undefined ? null : [];
  }
  const site = yield* parameterOf(world, argument);
  const declaration = site === null ? null : declarationAt(world, site);
  if (declaration === null) {
    return yield* libraryParameterSpellings(world, found, at);
  }
  const type = annotationOf(declaration);
  return type === undefined ? null : [{ node: type, bindings: yield* callBindings(world, found), positions: at.positions }];
}

// A callee's own type parameter at one call.
interface OwnParameter {
  readonly call: CallExpression | NewExpression;
  readonly signature: Signature;
  readonly parameter: TypeParameter;
  readonly at: number;
}

// The type parameters a call instantiates: the callee's own and its receiver's.
function* callBindings(world: NativeWorld, { call }: Argument): APIRequestGenerator<Bindings> {
  const signature = yield* (yield* world.checker.getResolvedSignature.gen(call)).getTarget.gen();
  const own = signature === undefined ? NO_BINDINGS : yield* ownBindings(world, call, signature);
  if (!isPropertyAccessExpression(call.expression)) {
    return own;
  }
  return merged(yield* receiverInstanceBindings(world, call.expression.expression), own);
}

// The type parameters a receiver instantiates: its type's, then, overriding them, what its declared annotation writes.
function* receiverInstanceBindings(world: NativeWorld, receiver: Expression): APIRequestGenerator<Bindings> {
  const typed = yield* instanceBindings(world, yield* world.checker.getTypeAtLocation.gen(receiver));
  return merged(typed, yield* writtenReceiverBindings(world, receiver));
}

// A receiver annotated with a reference to a product generic binds its type parameters to the written type arguments,
// else the defaults, by node: a type argument the same type as a default is still its own spelling.
function* writtenReceiverBindings(world: NativeWorld, receiver: Expression): APIRequestGenerator<Bindings> {
  let bindings: Bindings = NO_BINDINGS;
  for (const { node, bindings: current } of (yield* operandSpellings(world, receiver)) ?? []) {
    const name = isTypeReferenceNode(node) && isIdentifier(node.typeName) ? node.typeName : undefined;
    if (name !== undefined) {
      bindings = merged(bindings, yield* typeArgumentBindings(world, name, yield* genericParameters(world, name), current));
    }
  }
  return bindings;
}

// The type parameters of the product interface, alias or class a type name resolves to.
function* genericParameters(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly TypeParameterDeclaration[]> {
  const target = (yield* declaredSites(world, name)).map((site) => declarationAt(world, site)).find((found) => found !== null);
  return target !== undefined && (isInterfaceDeclaration(target) || isTypeAliasDeclaration(target) || isClassDeclaration(target))
    ? (target.typeParameters ?? [])
    : [];
}

// A product signature's own type parameters at a call, by the site of each parameter's name.
function* ownBindings(world: NativeWorld, call: CallExpression | NewExpression, signature: Signature): APIRequestGenerator<Bindings> {
  const bindings = new Map<string, Binding>();
  for (const [at, parameter] of (yield* signature.getTypeParameters.gen()).entries()) {
    for (const site of yield* symbolSites(world, yield* parameter.getSymbol.gen())) {
      const declaration = declarationAt(world, site);
      const binding =
        declaration !== null && isTypeParameterDeclaration(declaration) ? yield* ownBinding(world, { call, signature, parameter, at }, declaration) : undefined;
      if (binding !== undefined) {
        bindings.set(siteKey(site), binding);
      }
    }
  }
  return bindings;
}

// A product callee's own type parameter at a call: the call's explicit type argument; else the declared type of the
// argument it is inferred from; else its constraint when that names exactly one tuple. Its index is the string literal
// a parameter typed by it takes. Undefined when none of them is there.
function* ownBinding(world: NativeWorld, own: OwnParameter, declaration: TypeParameterDeclaration): APIRequestGenerator<Binding | undefined> {
  const explicit = own.call.typeArguments?.[own.at];
  if (explicit !== undefined) {
    return bindingOf([unbound(explicit)]);
  }
  const argument = yield* inferringArgument(world, own);
  const literal = argument === undefined ? undefined : unwrappedExpression(argument);
  const inferred = argument === undefined ? null : yield* argumentSpellings(world, argument);
  const index = literal !== undefined && isStringLiteral(literal) ? [literal.text] : yield* declaredKeys(world, inferred);
  if (inferred !== null) {
    return { spellings: inferred, index };
  }
  const { constraint } = declaration;
  const named = constraint === undefined ? null : yield* originsOf(world, [unbound(constraint)]);
  const spellings = constraint !== undefined && named !== null && named.tuples.size === 1 ? [unbound(constraint)] : null;
  return spellings === null && index === null ? undefined : { spellings: spellings ?? [], index };
}

// The property names the declared type of an argument spells: a variable typed `"theme"` or `Key` selects those
// properties, as the literal itself does.
function* declaredKeys(world: NativeWorld, declared: Declared): APIRequestGenerator<readonly string[] | null> {
  const keys: string[] = [];
  for (const spelling of declared ?? []) {
    if (!isTypeNode(spelling.node)) {
      return null;
    }
    const named = yield* keyNames(world, spelling.node);
    if (named === null) {
      return null;
    }
    keys.push(...named);
  }
  return keys.length > 0 ? keys : null;
}

// The argument a call infers a type parameter from: the one at a parameter typed by it, alone or beside other types.
function* inferringArgument(world: NativeWorld, { call, signature, parameter }: OwnParameter): APIRequestGenerator<Expression | undefined> {
  const parameters = yield* signature.getParameters.gen();
  const types = yield* all(...parameters.map((declared) => world.checker.getTypeOfSymbol.gen(declared)));
  for (const [at, type] of types.entries()) {
    const members = yield* constituents(type);
    if (members.some((member) => member.id === parameter.id)) {
      return call.arguments?.[at];
    }
  }
  return undefined;
}

function unwrappedExpression(node: Expression): Expression {
  let at = node;
  while (isParenthesizedExpression(at) || isNonNullExpression(at)) {
    at = at.expression;
  }
  return at;
}

// What the declaration of an argument's value spells: a name's or a member's annotation, an assertion's type, or the
// return type a called function declares; null for a literal or a value no declaration annotates.
function* argumentSpellings(world: NativeWorld, argument: Expression): APIRequestGenerator<Declared> {
  const value = unwrappedExpression(argument);
  if (isCallExpression(value)) {
    return yield* calleeReturnSpellings(world, value);
  }
  return isIdentifier(value) || isPropertyAccessExpression(value) || isAsExpression(value) || isSatisfiesExpression(value)
    ? yield* operandSpellings(world, value)
    : null;
}

// The return type a called function's declaration annotates, directly or through a variable typed by a function type.
function* calleeReturnSpellings(world: NativeWorld, call: CallExpression): APIRequestGenerator<Declared> {
  const callee = isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
  const types: TypeNode[] = [];
  for (const site of yield* declaredSites(world, callee)) {
    const declaration = declarationAt(world, site);
    const declared = declaration !== null && isSigned(declaration) ? declaration.type : functionReturnType(annotationOf(declaration));
    if (declared === undefined) {
      return null;
    }
    types.push(declared);
  }
  return types.length === 0 ? null : types.map(unbound);
}

const functionReturnType = (type: TypeNode | undefined): TypeNode | undefined => (type !== undefined && isFunctionTypeNode(type) ? type.type : undefined);

function* callReceiverBindings(world: NativeWorld, call: CallExpression | NewExpression): APIRequestGenerator<TypeBindings> {
  return isPropertyAccessExpression(call.expression) ? yield* receiverBindings(world, call.expression.expression) : NO_TYPE_BINDINGS;
}

// A library's parameter, read off its declared type: the type parameters it reaches are bound to the nodes that
// instantiate them, the callee's own, a destructured callee's call's, and a method receiver's; `path` walks into an
// object argument's properties, and a rest parameter's slot is its element.
function* libraryParameterSpellings(world: NativeWorld, found: Argument, at: Climb): APIRequestGenerator<Declared> {
  const { call, index } = found;
  const resolved = yield* world.checker.getResolvedSignature.gen(call);
  const destructured = yield* destructuredCallee(world, call);
  const signature = destructured.signature ?? (yield* resolved.getTarget.gen()) ?? resolved;
  const parameters = yield* signature.getParameters.gen();
  const parameter = parameters[Math.min(index, parameters.length - 1)];
  if (parameter === undefined) {
    return null;
  }
  const bound = new Map([...(yield* ownTypeBindings(world, call, signature)), ...destructured.bound, ...(yield* callReceiverBindings(world, call))]);
  const declared = yield* world.checker.getTypeOfSymbol.gen(parameter);
  const argument = call.arguments?.[index];
  const rest =
    index >= parameters.length - 1 && argument !== undefined && !isArrayLiteralExpression(argument) && (yield* world.checker.isArrayType.gen(declared));
  const slot = rest && declared.isTypeReference() ? ((yield* world.checker.getTypeArguments.gen(declared))[0] ?? declared) : declared;
  const types = at.returns === true ? yield* callbackReturns(slot) : [slot];
  return types === null ? null : yield* pathSpellings(world, { types, path: at.path, bound }, at.positions);
}

// The return types of the call signatures a declared type holds, one per union member that is a function type; null
// when it holds none.
function* callbackReturns(type: Type): APIRequestGenerator<readonly Type[] | null> {
  const members = yield* constituents(type);
  const signatures = (yield* all(...members.map((member) => member.getCallSignatures.gen()))).flat();
  return signatures.length === 0 ? null : yield* all(...signatures.map((signature) => signature.getReturnType.gen()));
}

// The spellings at the end of a property path through declared types; a type parameter met on the way is read whole
// through its binding.
function* pathSpellings(
  world: NativeWorld,
  { types, path, bound }: { readonly types: readonly Type[]; readonly path: readonly string[]; readonly bound: TypeBindings },
  positions: Positions,
): APIRequestGenerator<Declared> {
  const whole: Spelling[] = [];
  let current = types;
  for (const step of path) {
    const next = yield* pathStep(world, { types: current, step, bound });
    if (next === null) {
      return null;
    }
    whole.push(...next.whole);
    current = next.types;
  }
  const spelled = yield* partSpellings(world, current, bound, positions);
  return spelled === null ? null : [...whole, ...spelled];
}

// One property step: the property's types, and a bound type parameter's spellings read whole; null for an unbound one.
function* pathStep(
  world: NativeWorld,
  { types, step, bound }: { readonly types: readonly Type[]; readonly step: string; readonly bound: TypeBindings },
): APIRequestGenerator<{ readonly types: readonly Type[]; readonly whole: readonly Spelling[] } | null> {
  const next: Type[] = [];
  const whole: Spelling[] = [];
  for (const member of (yield* all(...types.map((type) => constituents(type)))).flat()) {
    if (!member.isTypeParameter()) {
      next.push(...(yield* propertyTypes(world.checker, [member], step)));
      continue;
    }
    const spellings = bound.get(member.id);
    if (spellings === undefined) {
      return null;
    }
    whole.push(...spellings);
  }
  return { types: next, whole };
}

// A library signature's own type parameters at a call: the call's explicit type arguments, else the declared type of
// the argument each is inferred from, else the type argument its construction's annotation writes at the same position.
function* ownTypeBindings(world: NativeWorld, call: CallExpression | NewExpression, signature: Signature): APIRequestGenerator<TypeBindings> {
  const bound = new Map<number, readonly Spelling[]>();
  // asked once per construction, and only when a parameter has no argument to be inferred from
  let annotated: readonly TypeNode[] | undefined;
  for (const [at, parameter] of (yield* signature.getTypeParameters.gen()).entries()) {
    const explicit = call.typeArguments?.[at];
    let spellings: Declared = null;
    if (explicit !== undefined) {
      spellings = [unbound(explicit)];
    } else {
      spellings = yield* inferredSpellings(world, { call, signature, parameter, at });
      if (spellings === null) {
        annotated ??= yield* annotatedContainerArguments(world, call);
        const written = annotated[at];
        spellings = written === undefined ? null : [unbound(written)];
      }
    }
    if (spellings !== null) {
      bound.set(parameter.id, spellings);
    }
  }
  return bound;
}

// A library container constructor and the annotations whose type arguments it takes positionally: `new Map(entries)`
// assigned to `ReadonlyMap<K, V>` infers its `K` and `V` from that annotation, which the checker keeps no alias for.
const CONTAINER_ANNOTATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["Map", new Set(["Map", "ReadonlyMap"])],
  ["Set", new Set(["Set", "ReadonlySet"])],
  ["WeakMap", new Set(["WeakMap"])],
  ["WeakSet", new Set(["WeakSet"])],
]);

// The names and written type arguments of the annotation a `new Map(...)` or `new Set(...)` is assigned to, read from
// syntax alone; undefined when the construction is another call or its annotation is no container of the same family.
function containerAnnotation(
  call: CallExpression | NewExpression,
): { readonly built: Identifier; readonly named: Identifier; readonly written: readonly TypeNode[] } | undefined {
  if (!(isNewExpression(call) && isIdentifier(call.expression))) {
    return undefined;
  }
  let holder: Node = call;
  while (isParenthesizedExpression(holder.parent)) {
    holder = holder.parent;
  }
  let annotation = spelledFor(holder.parent, holder);
  while (
    annotation !== undefined &&
    (isParenthesizedTypeNode(annotation) || (isTypeOperatorNode(annotation) && annotation.operator === SyntaxKind.ReadonlyKeyword))
  ) {
    annotation = annotation.type;
  }
  if (annotation === undefined || !isTypeReferenceNode(annotation) || !isIdentifier(annotation.typeName)) {
    return undefined;
  }
  const family = CONTAINER_ANNOTATIONS.get(call.expression.text);
  return family?.has(annotation.typeName.text) === true
    ? { built: call.expression, named: annotation.typeName, written: annotation.typeArguments ?? [] }
    : undefined;
}

// The type arguments the annotation of a `new Map(...)` or `new Set(...)` without type arguments writes, which are the
// construction's own type arguments by position: empty when there is no such annotation or either name is not the
// library's. The annotation's text is the trace: a type argument that names no tuple names none, whatever type it equals.
function* annotatedContainerArguments(world: NativeWorld, call: CallExpression | NewExpression): APIRequestGenerator<readonly TypeNode[]> {
  const annotation = containerAnnotation(call);
  if (annotation === undefined) {
    return [];
  }
  const [constructed, annotated] = yield* all(isLibReference(world, annotation.built), isLibReference(world, annotation.named));
  return constructed && annotated ? annotation.written : [];
}

// What the declared type of the argument a type parameter is inferred from spells; null when no argument is.
function* inferredSpellings(world: NativeWorld, own: OwnParameter): APIRequestGenerator<Declared> {
  const argument = yield* inferringArgument(world, own);
  return argument === undefined ? null : yield* argumentSpellings(world, argument);
}

// A callee destructured from a library call's result (`const [d, setD] = useState<Density>(...)`): the made call's
// type parameters, and the callee's signature as that call declares the destructured element, still spelled with
// them. The callee's own resolved signature would not do: an alias's (`Dispatch<A>`) leaves its own parameter unbound.
interface DestructuredCallee {
  readonly bound: TypeBindings;
  readonly signature: Signature | undefined;
}

const NOT_DESTRUCTURED: DestructuredCallee = { bound: NO_TYPE_BINDINGS, signature: undefined };

function* destructuredCallee(world: NativeWorld, call: CallExpression | NewExpression): APIRequestGenerator<DestructuredCallee> {
  if (!isIdentifier(call.expression)) {
    return NOT_DESTRUCTURED;
  }
  const declaration = (yield* declaredSites(world, call.expression)).map((site) => declarationAt(world, site)).find((node) => node !== null);
  const element = declaration !== undefined && isBindingElement(declaration) ? declaration : undefined;
  const pattern = element?.parent.parent;
  const made =
    pattern !== undefined && isVariableDeclaration(pattern) && pattern.initializer !== undefined ? unwrappedExpression(pattern.initializer) : undefined;
  if (element === undefined || made === undefined || !isCallExpression(made)) {
    return NOT_DESTRUCTURED;
  }
  const signature = yield* (yield* world.checker.getResolvedSignature.gen(made)).getTarget.gen();
  if (signature === undefined) {
    return NOT_DESTRUCTURED;
  }
  const bound = yield* ownTypeBindings(world, made, signature);
  const declared = yield* destructuredType(world, yield* signature.getReturnType.gen(), element);
  const signatures = declared === undefined ? [] : yield* declared.getCallSignatures.gen();
  return { bound, signature: signatures.length === 1 ? signatures[0] : undefined };
}

// The type a binding element takes from a declared value: a tuple's element at its position, or the property it names.
function* destructuredType(world: NativeWorld, value: Type, element: BindingElement): APIRequestGenerator<Type | undefined> {
  const pattern = element.parent;
  if (isArrayBindingPattern(pattern)) {
    const at = pattern.elements.findIndex((candidate) => sameNode(candidate, element));
    return value.isTypeReference() && at >= 0 ? (yield* world.checker.getTypeArguments.gen(value))[at] : undefined;
  }
  const key = element.propertyName ?? (element.name !== undefined && isIdentifier(element.name) ? element.name : undefined);
  const name = key === undefined ? null : propertyName(key);
  return name === null ? undefined : (yield* propertyTypes(world.checker, [value], name))[0];
}

// A receiver's declared type's arguments bind the type parameters of the receiver type's target; a receiver with no
// annotation takes them from the call that made it.
function* receiverBindings(world: NativeWorld, expression: Expression): APIRequestGenerator<TypeBindings> {
  const receiver = yield* world.checker.getTypeAtLocation.gen(expression);
  const declared = yield* operandSpellings(world, expression);
  if (!receiver.isTypeReference()) {
    return NO_TYPE_BINDINGS;
  }
  if (declared === null) {
    return yield* madeReceiverBindings(world, expression, receiver);
  }
  const parameters = yield* (yield* receiver.getTarget.gen()).getTypeParameters.gen();
  const written: { readonly spelling: Spelling; readonly parts: readonly Node[] | undefined }[] = [];
  for (const spelling of declared) {
    written.push({ spelling, parts: yield* typeArgumentNodes(world, spelling.node, 0) });
  }
  const bound = new Map<number, readonly Spelling[]>();
  for (const [at, parameter] of parameters.entries()) {
    const spellings = written.flatMap(({ spelling, parts }) => (parts?.[at] === undefined ? [] : [{ node: parts[at], bindings: spelling.bindings }]));
    if (spellings.length === written.length && spellings.length > 0) {
      bound.set(parameter.id, spellings);
    }
  }
  return bound;
}

// A receiver that is an unannotated constant made by a call (`const shown = useRef<Presence>(...)`): the made call's
// return type is the receiver's own generic, and its type arguments are spelled by the call's type parameters.
function* madeReceiverBindings(world: NativeWorld, expression: Expression, receiver: TypeReference): APIRequestGenerator<TypeBindings> {
  const value = unwrappedExpression(expression);
  const declaration = isIdentifier(value)
    ? (yield* declaredSites(world, value)).map((site) => declarationAt(world, site)).find((found) => found !== null)
    : undefined;
  const made = declaration !== undefined && isVariableDeclaration(declaration) && declaration.type === undefined ? declaration.initializer : undefined;
  const call = made === undefined ? undefined : unwrappedExpression(made);
  const signature = call !== undefined && isCallExpression(call) ? yield* (yield* world.checker.getResolvedSignature.gen(call)).getTarget.gen() : undefined;
  const returned = signature === undefined ? undefined : yield* signature.getReturnType.gen();
  if (call === undefined || !isCallExpression(call) || signature === undefined || returned === undefined || !returned.isTypeReference()) {
    return NO_TYPE_BINDINGS;
  }
  const target = yield* returned.getTarget.gen();
  if (target.id !== (yield* receiver.getTarget.gen()).id) {
    return NO_TYPE_BINDINGS;
  }
  const own = yield* ownTypeBindings(world, call, signature);
  const parts = yield* world.checker.getTypeArguments.gen(returned);
  const bound = new Map<number, readonly Spelling[]>();
  for (const [at, parameter] of (yield* target.getTypeParameters.gen()).entries()) {
    const part = parts[at];
    const spelled = part === undefined ? null : yield* typeSpellings(world, part, own, NO_POSITIONS);
    if (spelled !== null) {
      bound.set(parameter.id, spelled);
    }
  }
  return bound;
}

const RECEIVER_ALIAS_DEPTH = 4;

// The type arguments a receiver's annotation writes: an array type's element, a reference's arguments, through
// parentheses, `readonly` and product aliases.
function* typeArgumentNodes(world: NativeWorld, node: Node, depth: number): APIRequestGenerator<readonly Node[] | undefined> {
  if (isParenthesizedTypeNode(node) || (isTypeOperatorNode(node) && node.operator === SyntaxKind.ReadonlyKeyword)) {
    return yield* typeArgumentNodes(world, node.type, depth);
  }
  if (isArrayTypeNode(node)) {
    return [node.elementType];
  }
  if (!isTypeReferenceNode(node)) {
    return undefined;
  }
  if (node.typeArguments !== undefined) {
    return node.typeArguments;
  }
  const alias = (yield* declaredSites(world, node.typeName)).map((site) => declarationAt(world, site)).find((found) => found !== null);
  return depth < RECEIVER_ALIAS_DEPTH && alias !== undefined && isTypeAliasDeclaration(alias)
    ? yield* typeArgumentNodes(world, alias.type, depth + 1)
    : undefined;
}

const isArgument = (parent: Node, node: Node): boolean =>
  (isCallExpression(parent) || isNewExpression(parent)) && (parent.arguments?.some((argument) => sameNode(argument, node)) ?? false);

const EQUALITY_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);

// A read of a constant that only inspects it: the value goes into no slot.
function inspectsOnly(use: Node): boolean {
  const { parent } = use;
  return (
    (isBinaryExpression(parent) && EQUALITY_OPERATORS.has(parent.operatorToken.kind)) ||
    isCaseClause(parent) ||
    isTemplateSpan(parent) ||
    (isSwitchStatement(parent) && sameNode(parent.expression, use)) ||
    ((isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && sameNode(parent.expression, use))
  );
}

const isUnannotatedConstant = (declaration: VariableDeclaration): boolean =>
  declaration.type === undefined && isIdentifier(declaration.name) && declaration.parent.getFirstToken()?.kind === SyntaxKind.ConstKeyword;

/** How the literal at `site` initialises an unannotated `const`: `direct` as its whole value, `nested` under a
 *  property of its object; null when it initialises none. Either way it holds its own text, and its slot is wherever
 *  the constant, or the constant's property, is read. An element of a constant array is no constant: the array is a
 *  tuple or a list production enumerates. */
export function constantDepth(literal: Node): "direct" | "nested" | null {
  let at: Node = literal;
  let nested = false;
  let inArray = false;
  for (let parent = at.parent; ; parent = at.parent) {
    if (passesThrough(parent, at)) {
      inArray ||= isArrayLiteralExpression(parent);
      at = parent;
    } else if (isPropertyAssignment(parent) && sameNode(parent.initializer, at) && isObjectLiteralExpression(parent.parent)) {
      nested = true;
      at = parent.parent;
    } else {
      break;
    }
  }
  const { parent } = at;
  if (!(isVariableDeclaration(parent) && sameNode(parent.initializer, at) && isUnannotatedConstant(parent))) {
    return null;
  }
  if (nested) {
    return "nested";
  }
  return inArray ? null : "direct";
}

// A module-private constant's reads are all in its file; an exported one is read where the scan cannot follow.
function isFileLocal(declaration: VariableDeclaration): boolean {
  const statement = declaration.parent.parent;
  return isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword) !== true;
}

// The spellings of every slot a constant is read into; null when one cannot be read or a read leaves the file. `path`
// names the properties, outermost first, from the constant's object down to the literal asked about: a read of that
// property (`ROOT.carriers`) or a spread of the object is the literal's slot.
function* constantSpellings(world: NativeWorld, declaration: VariableDeclaration, path: readonly string[]): APIRequestGenerator<Declared> {
  if (!(isFileLocal(declaration) && isUnannotatedConstant(declaration))) {
    return null;
  }
  const home = world.siteOf(declaration.name);
  const spellings: Spelling[] = [];
  for (const use of referencedNames(declaration.getSourceFile()).filter(
    (name) => name.text === declaration.name.getText() && !sameNode(name, declaration.name),
  )) {
    const sites = yield* referredSites(world, use);
    const { parent } = use;
    const readsPath = path.length > 0 && isPropertyAccessExpression(parent) && sameNode(parent.expression, use) && parent.name.text === path[0];
    if (!sites.some((site) => site.file === home.file && site.position === home.position) || (!readsPath && inspectsOnly(use))) {
      continue;
    }
    const declared = readsPath ? yield* receivingSpellings(world, parent, path.slice(1)) : yield* receivingSpellings(world, use, path);
    if (declared === null) {
      return null;
    }
    spellings.push(...declared);
  }
  return spellings;
}

// Where a name refers to; a shorthand property's name (`{ state }`) is the property and the variable both, and refers to
// the variable.
function* referredSites(world: NativeWorld, use: Identifier): APIRequestGenerator<readonly Site[]> {
  const { parent } = use;
  if (!(isShorthandPropertyAssignment(parent) && sameNode(parent.name, use))) {
    return yield* declaredSites(world, use);
  }
  return yield* symbolSites(world, yield* targetOf(world.checker, yield* world.checker.getShorthandAssignmentValueSymbol.gen(parent)));
}

// Where a climb toward a slot stands: the property path from the node down to the value asked about, and whether the
// value sits in an array literal on the way.
interface Climb {
  readonly path: readonly string[];
  readonly positions: Positions;
  /** The value is the return of a callback the slot declares, not the slot's own. */
  readonly returns?: boolean;
}

// One step up from a value toward its slot: the slot's spellings when this parent decides them, else the node to climb
// from next.
type Step = { readonly done: Declared } | (Climb & { readonly node: Node });

const ASSIGNMENTS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
]);

const marked = (declared: Declared, positions: Positions): Declared =>
  declared === null || !isNested(positions) ? declared : declared.map((spelling) => ({ ...spelling, positions }));

// The index of a node in the array literal it is an element of; null when a spread before it moves it.
function indexIn(array: ArrayLiteralExpression, node: Node): Position {
  const at = array.elements.findIndex((element) => sameNode(element, node));
  return array.elements.slice(0, at).some(isSpreadElement) ? null : at;
}

function* receivingStep(world: NativeWorld, { node, path, positions }: Climb & { readonly node: Node }): APIRequestGenerator<Step> {
  const { parent } = node;
  if (passesThrough(parent, node)) {
    return { node: parent, path, positions: isArrayLiteralExpression(parent) ? [indexIn(parent, node), ...positions] : positions };
  }
  const spelled = spelledFor(parent, node);
  if (spelled !== undefined) {
    return { done: [{ node: spelled, bindings: NO_BINDINGS, positions }] };
  }
  if (isArgument(parent, node)) {
    return { done: yield* parameterSpellings(world, node, { path, positions }) };
  }
  if (isVariableDeclaration(parent)) {
    return { done: yield* constantSpellings(world, parent, path) };
  }
  if (isBinaryExpression(parent) && ASSIGNMENTS.has(parent.operatorToken.kind) && sameNode(parent.right, node)) {
    return { done: marked(yield* operandSpellings(world, parent.left), positions) };
  }
  const returning = returningFunction(parent, node);
  if (returning !== undefined) {
    return { done: marked(yield* returnSpellings(world, returning), positions) };
  }
  if (isJsxAttribute(parent) && parent.initializer !== undefined && sameNode(parent.initializer, node)) {
    return { done: marked(yield* jsxAttributeSpellings(world, parent), positions) };
  }
  // `({ inset = "section" }: Props)`: a default lands in the property the name destructures.
  if (isBindingElement(parent) && parent.initializer !== undefined && sameNode(parent.initializer, node)) {
    return { done: marked(yield* destructuredSpellings(world, parent), positions) };
  }
  return yield* objectStep(world, node, { path, positions });
}

// The unannotated function a value is returned from, by a `return` or as an arrow's body.
function returningFunction(parent: Node, node: Node): Signed | undefined {
  if (isReturnStatement(parent)) {
    return enclosingFunction(parent);
  }
  return isArrowFunction(parent) && sameNode(parent.body, node) ? parent : undefined;
}

const RETURN_ALIAS_DEPTH = 4;

// The slot an unannotated function's returned value lands in: the return type of the function type its own slot is
// spelled by, through parentheses and product aliases.
function* returnSpellings(world: NativeWorld, fn: Signed): APIRequestGenerator<Declared> {
  const library = yield* libraryCallbackReturns(world, fn);
  if (library !== undefined) {
    return library;
  }
  const slot = yield* receivingSpellings(world, fn);
  const returned: Spelling[] = [];
  for (const spelling of slot ?? []) {
    const type = yield* functionTypeReturn(world, spelling.node, 0);
    if (type === undefined) {
      return null;
    }
    returned.push({ ...spelling, node: returnedType(fn, type) ?? type });
  }
  return slot === null ? null : returned;
}

// A callback handed to a library parameter returns what the callback type that parameter declares returns, through the
// call's type arguments (`setState((prev) => next)`, whose parameter is `S | ((prev: S) => S)`). Undefined for any other
// callback.
function* libraryCallbackReturns(world: NativeWorld, fn: Signed): APIRequestGenerator<Declared | undefined> {
  const found = argumentOf(fn);
  if (found === undefined || (yield* infersFromArgument(world, fn))) {
    return undefined;
  }
  const site = yield* parameterOf(world, fn);
  if (site === null || declarationAt(world, site) !== null) {
    return undefined;
  }
  return yield* libraryParameterSpellings(world, found, { path: [], positions: NO_POSITIONS, returns: true });
}

function* functionTypeReturn(world: NativeWorld, node: Node, depth: number): APIRequestGenerator<TypeNode | undefined> {
  if (isParenthesizedTypeNode(node)) {
    return yield* functionTypeReturn(world, node.type, depth);
  }
  if (isFunctionTypeNode(node)) {
    return node.type;
  }
  if (!(isTypeReferenceNode(node) && node.typeArguments === undefined) || depth >= RETURN_ALIAS_DEPTH) {
    return undefined;
  }
  const alias = (yield* declaredSites(world, node.typeName)).map((site) => declarationAt(world, site)).find((found) => found !== null);
  return alias !== undefined && isTypeAliasDeclaration(alias) ? yield* functionTypeReturn(world, alias.type, depth + 1) : undefined;
}

// A property assignment whose value is the node, or a shorthand one (`{ state }`) whose name is it.
const writesProperty = (parent: Node, node: Node): parent is PropertyAssignment | ShorthandPropertyAssignment =>
  (isPropertyAssignment(parent) && sameNode(parent.initializer, node)) || (isShorthandPropertyAssignment(parent) && sameNode(parent.name, node));

// A value written into an object literal: a property's declared spelling, or the object's own slot further up when
// the property's declaration cannot be read (a library's, or one spelled by a type parameter nothing here binds).
function* objectStep(world: NativeWorld, node: Node, { path, positions }: Climb): APIRequestGenerator<Step> {
  const { parent } = node;
  if (writesProperty(parent, node) && isObjectLiteralExpression(parent.parent)) {
    const name = propertyName(parent.name);
    const declared = yield* propertySpellings(world, name, parent.parent);
    const readable = declared !== undefined && declared !== null && (yield* originsOf(world, declared)) !== null;
    return readable ? { done: marked(declared, positions) } : { node: parent.parent, path: name === null ? path : [name, ...path], positions };
  }
  // `{ ...ROOT }`: the spread object's properties become the outer object's, so the path's first property is the slot.
  if (isSpreadAssignment(parent) && isObjectLiteralExpression(parent.parent) && path.length > 0) {
    const declared = yield* propertySpellings(world, path[0] ?? null, parent.parent);
    if (declared === undefined) {
      return { node: parent.parent, path, positions };
    }
    return { done: path.length === 1 ? marked(declared, positions) : null };
  }
  return { done: null };
}

// The spellings of the slot a value flows into. `path` names the properties, outermost first, from `start` down to the
// value asked about, when that value sits inside an unannotated object.
function* receivingSpellings(world: NativeWorld, start: Node, path: readonly string[] = []): APIRequestGenerator<Declared> {
  let step: Step = { node: start, path, positions: NO_POSITIONS };
  while (!("done" in step)) {
    step = yield* receivingStep(world, step);
  }
  return step.done;
}

// The annotations of the declaration an operand reads: a name, or a member access.
function* operandSpellings(world: NativeWorld, operand: Node): APIRequestGenerator<Declared> {
  let node = operand;
  while (isParenthesizedExpression(node) || isNonNullExpression(node)) {
    node = node.expression;
  }
  if (isAsExpression(node) || isSatisfiesExpression(node)) {
    return [unbound(node.type)];
  }
  const name = isPropertyAccessExpression(node) ? node.name : node;
  if (!isIdentifier(name)) {
    return null;
  }
  const sites = yield* declaredSites(world, name);
  if (isPropertyAccessExpression(node) && sites.length > 0 && sites.every((site) => declarationAt(world, site) === null)) {
    return yield* libraryMemberSpellings(world, node);
  }
  // A member's annotation is spelled with its owner's type parameters, which the receiver instantiates.
  const bindings = isPropertyAccessExpression(node) ? yield* receiverInstanceBindings(world, node.expression) : NO_BINDINGS;
  const spelled: Spelling[] = [];
  for (const site of sites) {
    const spellings = yield* declarationSpellings(world, declarationAt(world, site), bindings);
    if (spellings === null) {
      return null;
    }
    spelled.push(...spellings);
  }
  return spelled.length === 0 ? null : spelled;
}

// A library member (`ref.current`), read off its declared type in the receiver's generic, with the receiver's type
// parameters bound to what its annotation or the call that made it spells.
function* libraryMemberSpellings(world: NativeWorld, access: PropertyAccessExpression): APIRequestGenerator<Declared> {
  const receiver = yield* world.checker.getTypeAtLocation.gen(access.expression);
  const property = receiver.isTypeReference() ? yield* world.checker.getPropertyOfType.gen(yield* receiver.getTarget.gen(), access.name.text) : undefined;
  if (property === undefined) {
    return null;
  }
  const bound = yield* receiverBindings(world, access.expression);
  return yield* typeSpellings(world, yield* world.checker.getTypeOfSymbol.gen(property), bound, NO_POSITIONS);
}

// What one declaration of an operand spells: its annotation, or a destructured name's property declaration.
function* declarationSpellings(world: NativeWorld, declaration: Node | null, bindings: Bindings): APIRequestGenerator<Declared> {
  const type = annotationOf(declaration);
  if (type !== undefined) {
    return [{ node: type, bindings }];
  }
  return declaration !== null && isBindingElement(declaration) ? yield* destructuredSpellings(world, declaration) : null;
}

// A name destructured from an annotated object (`function View({ initial }: Props)`): the declaration of the property it
// reads, under the annotated type's instantiation; null when the holder has no annotation.
function* destructuredSpellings(world: NativeWorld, element: BindingElement): APIRequestGenerator<Declared> {
  const { parent: pattern } = element;
  const holder = pattern.parent;
  const key = element.propertyName ?? (element.name !== undefined && isIdentifier(element.name) ? element.name : undefined);
  const name = key === undefined ? null : propertyName(key);
  const annotation = isObjectBindingPattern(pattern) && (isParameterDeclaration(holder) || isVariableDeclaration(holder)) ? holder.type : undefined;
  if (annotation === undefined || name === null) {
    return null;
  }
  return yield* foundSpellings(world, yield* propertyOn(world, yield* constituents(yield* world.checker.getTypeAtLocation.gen(annotation)), name));
}

// A JSX attribute's value (`<Pane inset="block" />`): the declaration of the props property it sets, under the props
// type's instantiation.
function* jsxAttributeSpellings(world: NativeWorld, attribute: JsxAttribute): APIRequestGenerator<Declared> {
  const { parent } = attribute;
  const props = isIdentifier(attribute.name) && isJsxAttributes(parent) ? yield* world.checker.getContextualType.gen(parent) : undefined;
  if (props === undefined || !isIdentifier(attribute.name)) {
    return null;
  }
  return yield* foundSpellings(world, yield* propertyOn(world, yield* constituents(props), attribute.name.text));
}

// The annotations of a found property's declarations, under its owners' instantiations; null when one is unannotated
// or outside the production sources.
function* foundSpellings(world: NativeWorld, found: FoundProperty): APIRequestGenerator<Declared> {
  const types = found.sites.map((site) => annotationOf(declarationAt(world, site)));
  if ((types.length === 0 && found.templates.length === 0) || types.includes(undefined)) {
    return null;
  }
  const bindings = yield* ownerBindings(world, found.owners);
  return [
    ...types.flatMap((type) => (type === undefined ? [] : [{ node: type, bindings }])),
    ...found.templates.map((template) => ({ node: template.node, bindings: merged(bindings, template.bindings) })),
  ];
}

// A name a declaration or a member access introduces, not one that refers to something.
function introducesName(parent: Node, name: Identifier): boolean {
  if (isPropertyAccessExpression(parent)) {
    return sameNode(parent.name, name);
  }
  const declares =
    isPropertyAssignment(parent) ||
    isPropertySignatureDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    isMethodSignatureDeclaration(parent) ||
    isMethodDeclaration(parent) ||
    isParameterDeclaration(parent) ||
    isVariableDeclaration(parent) ||
    isBindingElement(parent) ||
    isTypeParameterDeclaration(parent) ||
    isFunctionDeclaration(parent) ||
    isEnumMember(parent);
  return declares && sameNode(parent.name, name);
}

// A name in a type position: a failure to resolve it leaves the type unread, where an unresolved value name is a global.
const namesType = (parent: Node): boolean =>
  isTypeReferenceNode(parent) || isTypeQueryNode(parent) || isQualifiedName(parent) || isExpressionWithTypeArguments(parent);

function referencedNames(root: Node): readonly Identifier[] {
  const found: Identifier[] = [];
  const visit = (node: Node): void => {
    if (isIdentifier(node) && !introducesName(node.parent, node)) {
      found.push(node);
    }
    // `as const` names no declaration
    if (isAsExpression(node) && isConstType(node.type)) {
      visit(node.expression);
      return;
    }
    node.forEachChild(visit);
  };
  visit(root);
  return found;
}

interface Expansion {
  /** The tuple key a variable declares. */
  readonly tuple: string | null;
  /** What else the declaration spells that a slot can take its vocabulary from. */
  readonly into: readonly (Node | undefined)[];
  /** For a type parameter a caller instantiates, the key its binding is held under: the slot reads its instantiation. */
  readonly parameter: string | null;
  /** The parameter is a mapped type's key, which ranges over its constraint when nothing binds it. */
  readonly mapped: boolean;
  /** The type parameters a generic declaration's `into` is spelled with, which a reference's type arguments bind. */
  readonly typeParameters: readonly TypeParameterDeclaration[];
}

const NOTHING: Expansion = { tuple: null, into: [], parameter: null, mapped: false, typeParameters: [] };

// What one declaration of a referenced name adds: a variable is a tuple and spells its annotation and value, an alias its
// type, a function its body, a property or parameter its annotation or value, an interface what it extends and holds.
function expansion(site: Site, declaration: Node | null): Expansion {
  if (declaration === null) {
    return NOTHING;
  }
  if (isVariableDeclaration(declaration)) {
    const tuple = isIdentifier(declaration.name) ? `${site.file}:${declaration.name.text}` : null;
    // A tuple spells itself and the tuples it spreads, whose members it carries; what it `satisfies` is its lineage,
    // which `satisfiedOrigins` reads, never its slot's.
    const value = tupleSpreads(declaration.initializer) ?? [declaration.initializer];
    return { ...NOTHING, tuple, into: [declaration.type, ...value] };
  }
  if (isFunctionDeclaration(declaration) || isMethodDeclaration(declaration)) {
    return { ...NOTHING, into: [declaration] };
  }
  const typed = typeExpansion(site, declaration);
  if (typed !== undefined) {
    return typed;
  }
  const written = isPropertyAssignment(declaration) || isPropertyDeclaration(declaration) ? declaration.initializer : undefined;
  return { ...NOTHING, into: [annotationOf(declaration), written] };
}

// The spread elements' operands of an `as const` array literal, through parentheses and `satisfies`; null for any other
// value.
function tupleSpreads(node: Expression | undefined): readonly Expression[] | null {
  let at = node;
  while (at !== undefined && (isParenthesizedExpression(at) || isSatisfiesExpression(at))) {
    at = at.expression;
  }
  if (at === undefined || !isConstAssertion(at) || !isArrayLiteralExpression(at.expression)) {
    return null;
  }
  return at.expression.elements.flatMap((element) => (isSpreadElement(element) ? [element.expression] : []));
}

// What a type declaration adds: an alias its type, a type parameter its constraint, an interface what it extends and
// holds, each generic one with the type parameters a reference binds.
function typeExpansion(site: Site, declaration: Node): Expansion | undefined {
  if (isTypeAliasDeclaration(declaration)) {
    return { ...NOTHING, into: [declaration.type], typeParameters: declaration.typeParameters ?? [] };
  }
  if (isTypeParameterDeclaration(declaration)) {
    // An `infer X` is the checked type's own part: the names that type writes are read where it is written, so the variable
    // adds none and, unlike a parameter a caller instantiates, has nothing to bind.
    if (isInferTypeNode(declaration.parent)) {
      return { ...NOTHING, into: [declaration.constraint] };
    }
    // A mapped type's key ranges over its constraint unless a property of the type binds it, so the constraint is its
    // vocabulary.
    return { ...NOTHING, into: [declaration.constraint], parameter: siteKey(site), mapped: isMappedTypeNode(declaration.parent) };
  }
  if (isInterfaceDeclaration(declaration)) {
    // A member's type is what an indexed access (`Interface["member"]`) reads.
    const into = [...(declaration.heritageClauses ?? []), ...declaration.members.map(annotationOf)];
    return { ...NOTHING, into, typeParameters: declaration.typeParameters ?? [] };
  }
  return undefined;
}

// The bindings a reference to a generic declaration gives its type parameters: each type argument, else the
// parameter's default, read under the reference's own bindings.
function* typeArgumentBindings(
  world: NativeWorld,
  name: Identifier,
  parameters: readonly TypeParameterDeclaration[],
  current: Bindings,
): APIRequestGenerator<Bindings> {
  if (parameters.length === 0) {
    return current;
  }
  const { parent } = name;
  const written = isTypeReferenceNode(parent) || isExpressionWithTypeArguments(parent) ? parent.typeArguments : undefined;
  const bindings = new Map(current);
  for (const [at, parameter] of parameters.entries()) {
    const node = written?.[at] ?? parameter.defaultType;
    if (node !== undefined) {
      bindings.set(siteKey(world.siteOf(parameter.name)), { spellings: [{ node, bindings: current }], index: yield* forwardedKeys(world, node, current) });
    }
  }
  return bindings;
}

// The properties a written type argument selects: the keys a type parameter it names is bound to, or the literals it
// spells.
function* forwardedKeys(world: NativeWorld, node: TypeNode, current: Bindings): APIRequestGenerator<readonly string[] | null> {
  const bound =
    isTypeReferenceNode(node) && isIdentifier(node.typeName) && node.typeArguments === undefined
      ? (yield* declaredSites(world, node.typeName)).flatMap((site) => current.get(siteKey(site))?.index ?? [])
      : [];
  return bound.length > 0 ? bound : yield* keyNames(world, node);
}

// Every declaration a name resolves to, expanded; null when a type name resolves to none.
function* expansionsOf(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly Expansion[] | null> {
  const sites = yield* declaredSites(world, name);
  if (sites.length === 0 && namesType(name.parent)) {
    return null;
  }
  return sites.map((site) => expansion(site, declarationAt(world, site)));
}

// A spelling still to read: `property` scopes a type to one of its properties, as `T["p"]` does, and `collect` says
// whether its literal types re-spell the slot. A property that cannot be found is read whole for its tuples only.
interface Reach extends Spelling {
  readonly property: string | null;
  readonly collect: boolean;
}

interface Read {
  readonly tuples: readonly string[];
  readonly next: readonly Spelling[];
  /** The `T["p"]` accesses in the spelling, each read as `T` scoped to `p`. */
  readonly scoped: readonly Scoped[];
}

// How a reading treats a name it cannot settle: `slot` gives up, since the slot may then be any tuple's; `links` reads
// on past it, since a reading that only adds links to a tuple is sound with any part of them.
type Reading = "slot" | "links";

// The property names a written index spells: a string literal or a union of them. `T["p" | "q"]` gives `p` and `q`.
function literalKeys(node: TypeNode): readonly string[] | null {
  if (isParenthesizedTypeNode(node)) {
    return literalKeys(node.type);
  }
  if (isLiteralTypeNode(node)) {
    return isStringLiteral(node.literal) ? [node.literal.text] : null;
  }
  if (!isUnionTypeNode(node)) {
    return null;
  }
  const keys = node.types.map(literalKeys);
  return keys.every((key) => key !== null) ? keys.flat() : null;
}

const KEY_ALIAS_DEPTH = 4;

// The property names an index type spells: its literals, through product aliases of them.
function* keyNames(world: NativeWorld, node: TypeNode, depth = 0): APIRequestGenerator<readonly string[] | null> {
  const written = literalKeys(node);
  if (written !== null || !(isTypeReferenceNode(node) && isIdentifier(node.typeName) && node.typeArguments === undefined) || depth >= KEY_ALIAS_DEPTH) {
    return written;
  }
  const aliases = yield* aliasedTypes(world, node.typeName);
  const keys: string[] = [];
  for (const alias of aliases) {
    const named = yield* keyNames(world, alias, depth + 1);
    if (named === null) {
      return null;
    }
    keys.push(...named);
  }
  return aliases.length === 0 ? null : keys;
}

// An indexed access scoped to the properties its index selects, read at its object type.
interface ScopedAccess {
  readonly node: Node;
  readonly property: string;
  /** The written index, whose names are keys and no vocabulary. */
  readonly index: Node;
}

// The `T["p"]` accesses under `root`, by their object type: their names are read scoped, never whole. `T[K]` is one
// when `K` is a type parameter whose binding selects a property.
function* scopedAccesses(world: NativeWorld, root: Node, bindings: Bindings): APIRequestGenerator<readonly ScopedAccess[]> {
  const accesses: IndexedAccessTypeNode[] = [];
  const visit = (node: Node): void => {
    if (isIndexedAccessTypeNode(node)) {
      accesses.push(node);
    }
    node.forEachChild(visit);
  };
  visit(root);
  const found: ScopedAccess[] = [];
  for (const access of accesses) {
    const { indexType } = access;
    const selected =
      isTypeReferenceNode(indexType) && isIdentifier(indexType.typeName)
        ? (yield* declaredSites(world, indexType.typeName)).flatMap((site) => bindings.get(siteKey(site))?.index ?? [])
        : [];
    const properties = (yield* keyNames(world, indexType)) ?? selected;
    if (properties.length > 0 && !found.some(({ node }) => isUnder(access, new Set([nodeKey(node)])))) {
      found.push(...properties.map((property) => ({ node: access.objectType, property, index: indexType })));
    }
  }
  return found;
}

// The type arguments of library interface and class references under `root`, by node key: a literal is no instance of
// `Box<Mode>`, so `Mode` is its slot only when the literal is an element of the container.
function* containerArguments(world: NativeWorld, root: Node): APIRequestGenerator<ReadonlySet<string>> {
  const references: TypeReferenceNode[] = [];
  const visit = (node: Node): void => {
    if (isTypeReferenceNode(node) && node.typeArguments !== undefined) {
      references.push(node);
    }
    node.forEachChild(visit);
  };
  visit(root);
  const skipped = new Set<string>();
  for (const reference of references) {
    const symbol = yield* targetOf(world.checker, yield* world.checker.getSymbolAtLocation.gen(reference.typeName));
    const shaped = symbol !== undefined && (hasFlag(symbol.flags, SymbolFlags.Interface) || hasFlag(symbol.flags, SymbolFlags.Class));
    const library = shaped && (yield* symbolSites(world, symbol)).every((site) => !productReader(site.file));
    for (const argument of library ? (reference.typeArguments ?? []) : []) {
      skipped.add(nodeKey(argument));
    }
  }
  return skipped;
}

const isUnder = (node: Node, ancestors: ReadonlySet<string>): boolean => {
  for (let at = node; !isSourceFile(at); at = at.parent) {
    if (ancestors.has(nodeKey(at))) {
      return true;
    }
  }
  return false;
};

// The tuples one spelling names and the further spellings it leads to; null when it cannot be read to the end.
function* readSpelling(world: NativeWorld, spelling: Spelling, reading: Reading): APIRequestGenerator<Read | null> {
  const { node: root, bindings } = spelling;
  const { positions = NO_POSITIONS } = spelling;
  const tuples: string[] = [];
  const next: Spelling[] = [];
  const scoped = (yield* scopedAccesses(world, root, bindings)).map((access) => ({ ...access, bindings, positions }));
  const objects = new Set(scoped.flatMap(({ node, index }) => [nodeKey(node), nodeKey(index)]));
  const contained = reading === "slot" && !isNested(positions) ? yield* containerArguments(world, root) : new Set<string>();
  for (const name of referencedNames(root).filter((candidate) => !(isUnder(candidate, objects) || isUnder(candidate, contained)))) {
    const reached = yield* expansionsOf(world, name);
    if (reading === "slot" && reached === null) {
      return null;
    }
    for (const expanded of reached ?? []) {
      const read = yield* expandedRead(world, { name, expanded, bindings, positions }, reading);
      if (read === null) {
        return null;
      }
      tuples.push(...read.tuples);
      next.push(...read.next);
    }
  }
  return { tuples, next, scoped };
}

// What one expansion of a name adds to a reading: a bound type parameter's instantiation, or the declaration's tuple
// and spellings under the bindings its reference gives; null when a slot reading meets a type parameter with no
// binding.
function* expandedRead(
  world: NativeWorld,
  {
    name,
    expanded,
    bindings,
    positions,
  }: { readonly name: Identifier; readonly expanded: Expansion; readonly bindings: Bindings; readonly positions: Positions },
  reading: Reading,
): APIRequestGenerator<Omit<Read, "scoped"> | null> {
  const bound = expanded.parameter === null ? undefined : bindings.get(expanded.parameter)?.spellings;
  if (bound !== undefined && bound !== null) {
    return { tuples: [], next: bound.map((spelling) => (isNested(positions) ? { ...spelling, positions } : spelling)) };
  }
  if (reading === "slot" && expanded.parameter !== null && !expanded.mapped) {
    return null;
  }
  const inner = yield* typeArgumentBindings(world, name, expanded.typeParameters, bindings);
  return {
    tuples: expanded.tuple === null ? [] : [expanded.tuple],
    next: expanded.into.flatMap((spelling) => (spelling === undefined ? [] : [{ node: spelling, bindings: inner, positions }])),
  };
}

// The members named `property` in an interface or a type literal, and what an interface extends, still scoped to it.
function memberSteps(members: readonly Node[], property: string, bindings: Bindings): readonly Scoped[] {
  return members.flatMap((member) =>
    isPropertySignatureDeclaration(member) && propertyName(member.name) === property ? [{ node: member.type, property: null, bindings }] : [],
  );
}

interface Scoped extends Spelling {
  readonly property: string | null;
}

// The name a type reference or a heritage entry refers to.
function referredName(node: Node): Identifier | null {
  if (isTypeReferenceNode(node) && isIdentifier(node.typeName)) {
    return node.typeName;
  }
  return isExpressionWithTypeArguments(node) && isIdentifier(node.expression) ? node.expression : null;
}

// A named type scoped to one property: each interface's member of that name and what it extends, each alias's type.
function* declaredPropertySteps(
  world: NativeWorld,
  name: Identifier,
  { property, bindings }: ScopedTo,
  known?: readonly Site[],
): APIRequestGenerator<readonly Scoped[] | null> {
  const sites = known ?? (yield* declaredSites(world, name));
  const steps: Scoped[] = [];
  for (const declaration of sites.map((site) => declarationAt(world, site))) {
    if (declaration !== null && isInterfaceDeclaration(declaration)) {
      const inner = yield* typeArgumentBindings(world, name, declaration.typeParameters ?? [], bindings);
      const bases = (declaration.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => ({ node: type, property, bindings: inner })));
      steps.push(...memberSteps(declaration.members, property, inner), ...bases);
    } else if (declaration !== null && isTypeAliasDeclaration(declaration)) {
      steps.push({ node: declaration.type, property, bindings: yield* typeArgumentBindings(world, name, declaration.typeParameters ?? [], bindings) });
    } else {
      return null;
    }
  }
  return sites.length === 0 ? null : steps;
}

// One step of reading a type scoped to one property; null when the type is not one a property can be found in.
// A spelling scoped to one of its properties.
interface ScopedTo extends Spelling {
  readonly property: string;
}

function* propertyStep(world: NativeWorld, scoped: ScopedTo, known?: readonly Site[]): APIRequestGenerator<readonly Scoped[] | null> {
  const { node, property, bindings } = scoped;
  if (isParenthesizedTypeNode(node)) {
    return [{ node: node.type, property, bindings }];
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.map((type) => ({ node: type, property, bindings }));
  }
  if (isTypeLiteralNode(node)) {
    return memberSteps(node.members, property, bindings);
  }
  const name = referredName(node);
  return name === null ? null : yield* declaredPropertySteps(world, name, scoped, known);
}

// Every string literal type a spelling writes, by site key; a `T["p"]` access is read scoped, so its literals are not
// the spelling's own.
function collectLiteralTypes(root: Node, into: Map<string, string>): void {
  const visit = (node: Node): void => {
    if (isIndexedAccessTypeNode(node) && literalKeys(node.indexType) !== null) {
      return;
    }
    if (isLiteralTypeNode(node) && isStringLiteral(node.literal)) {
      into.set(nodeKey(node.literal), node.literal.text);
    }
    node.forEachChild(visit);
  };
  visit(root);
}

// What a reach scoped to `property` leads to; a type the property cannot be found in is read whole, for its tuples only.
function* scopedReaches(world: NativeWorld, reach: Reach, property: string): APIRequestGenerator<readonly Reach[]> {
  const steps = (yield* propertyStep(world, { ...reach, property })) ?? (yield* declaredPropertyOf(world, { ...reach, property }));
  return steps === null ? [{ ...reach, property: null, collect: false }] : steps.map((step) => ({ ...step, collect: reach.collect }));
}

// The spellings of property `name` in the slot an object literal fills inside an inferred call, read from the type node
// the callee writes for the parameter, with its own type parameters at their constraints: the member's own written type
// and the written reference to the interface that declares it, so a type argument a reference leaves to its default is
// the default's node. The checker's instantiation of the same slot holds a one-member tuple's element as a bare literal
// that no declaration traces. Null when the slot has no written parameter type or the descent meets a type it cannot
// step through, which leaves the checker's reading to decide. An object literal reaching a union reads every arm that
// declares the property.
function* writtenSpellings(world: NativeWorld, slot: DeclaredSlot | undefined, name: string): APIRequestGenerator<Declared> {
  return slot?.written === undefined ? null : yield* writtenPath(world, unbound(slot.written), [...slot.path, name]);
}

// Library types that keep their argument's properties as they are: no member's type changes.
const TRANSPARENT_MAPPERS: ReadonlySet<string> = new Set(["Readonly", "Partial", "Required"]);
const RECORD = "Record";

// The member type nodes a path of property names reaches from a written type; null when a step cannot be read or finds
// nothing.
function* writtenPath(world: NativeWorld, start: Spelling, path: readonly string[]): APIRequestGenerator<Declared> {
  let current: readonly Spelling[] = [start];
  for (const property of path) {
    const reached = yield* writtenProperty(world, current, property);
    if (reached === null) {
      return null;
    }
    current = reached;
  }
  return current;
}

// What property `property` is, in each of the written types a step has reached: the frontier of types is stepped through
// together, one round of requests per frontier, until each member's own type is found.
function* writtenProperty(world: NativeWorld, from: readonly Spelling[], property: string): APIRequestGenerator<Declared> {
  const reached: Spelling[] = [];
  const seen = new Set<string>();
  let frontier: readonly ScopedTo[] = from.map((spelling) => ({ ...spelling, property }));
  while (frontier.length > 0) {
    const fresh = unseen(seen, frontier);
    const steps = seen.size > SPELLING_LIMIT ? null : yield* writtenSteps(world, fresh);
    if (steps === null) {
      return null;
    }
    const next: ScopedTo[] = [];
    for (const step of steps) {
      if (step.property === null) {
        reached.push(step);
      } else {
        next.push({ ...step, property: step.property });
      }
    }
    frontier = next;
  }
  return reached.length === 0 ? null : reached;
}

// The frontier items not yet visited, recording them.
function unseen(seen: Set<string>, frontier: readonly ScopedTo[]): readonly ScopedTo[] {
  return frontier.filter((at) => {
    const key = `${nodeKey(at.node)}:${at.property}:${bindingsKey(at.bindings)}`;
    const fresh = !seen.has(key);
    seen.add(key);
    return fresh;
  });
}

// What a frontier needs answered before its steps are read: the declaration sites of every type name in it
// (`getSymbolAtLocation` over all the names, one request) and the keys of every indexed access's index (`getTypeAtLocation`
// over all the index nodes, one request), so no step asks the checker about a node itself.
interface Answers {
  readonly sites: readonly Site[];
  readonly keys: readonly string[] | null;
}

// Each frontier item's written steps, or null when any item cannot be stepped through.
function* writtenSteps(world: NativeWorld, frontier: readonly ScopedTo[]): APIRequestGenerator<readonly Scoped[] | null> {
  if (frontier.length === 0) {
    return [];
  }
  const [sites, keys] = yield* all(
    namedSites(
      world,
      frontier.map(({ node }) => referredName(node)),
    ),
    indexKeys(
      world,
      frontier.map(({ node }) => (isIndexedAccessTypeNode(node) ? node.indexType : null)),
    ),
  );
  const steps = yield* all(...frontier.map((scoped, at) => writtenStep(world, scoped, { sites: sites[at] ?? [], keys: keys[at] ?? null })));
  return steps.some((step) => step === null) ? null : steps.flatMap((step) => step ?? []);
}

// The declaration sites of each name, by one array-form request over the names present, aligned to `names`.
function* namedSites(world: NativeWorld, names: readonly (Identifier | null)[]): APIRequestGenerator<readonly (readonly Site[])[]> {
  const asked = names.flatMap((name) => (name === null ? [] : [name]));
  if (asked.length === 0) {
    return names.map(() => []);
  }
  const symbols = yield* world.checker.getSymbolAtLocation.gen(asked);
  const targets = yield* all(...symbols.map((symbol) => targetOf(world.checker, symbol)));
  const found = yield* all(...targets.map((target) => symbolSites(world, target)));
  let next = 0;
  return names.map((name) => (name === null ? [] : (found[next++] ?? [])));
}

// The keys each index type selects, by one array-form request over the indexes present, aligned to `indexes`.
function* indexKeys(world: NativeWorld, indexes: readonly (TypeNode | null)[]): APIRequestGenerator<readonly (readonly string[] | null)[]> {
  const asked = indexes.flatMap((index) => (index === null ? [] : [index]));
  if (asked.length === 0) {
    return indexes.map(() => null);
  }
  const types = yield* world.checker.getTypeAtLocation.gen(asked);
  const found = yield* all(...types.map((type) => typeKeys(type)));
  let next = 0;
  return indexes.map((index) => (index === null ? null : (found[next++] ?? null)));
}

// One step of a written descent: what {@link propertyStep} reads, and beyond it a type parameter (what instantiates it,
// else its constraint), `Readonly`, `Partial` and `Required` of a type, `Record<K, V>`'s value, and an indexed access
// at the properties its index selects.
function* writtenStep(world: NativeWorld, scoped: ScopedTo, answers: Answers): APIRequestGenerator<readonly Scoped[] | null> {
  const { node } = scoped;
  if (isIndexedAccessTypeNode(node)) {
    return yield* indexedSteps(world, scoped, node, answers.keys);
  }
  const name = referredName(node);
  if (name === null || !isTypeReferenceNode(node)) {
    return yield* propertyStep(world, scoped, answers.sites);
  }
  const [parameter] = answers.sites.flatMap((site) => {
    const found = declarationAt(world, site);
    return found !== null && isTypeParameterDeclaration(found) ? [found] : [];
  });
  if (parameter !== undefined) {
    return parameterSteps(world, scoped, parameter);
  }
  return answers.sites.every((site) => !productReader(site.file)) ? libraryTypeSteps(scoped, node, name) : yield* propertyStep(world, scoped, answers.sites);
}

// `O[I]` scoped to a property: `I`'s keys, each read as `O`'s member, then the property of what they reach.
function* indexedSteps(
  world: NativeWorld,
  { property, bindings }: ScopedTo,
  node: IndexedAccessTypeNode,
  keys: readonly string[] | null,
): APIRequestGenerator<readonly Scoped[] | null> {
  if (keys === null) {
    return null;
  }
  const reached = yield* all(...keys.map((key) => writtenPath(world, { node: node.objectType, bindings }, [key])));
  return reached.some((spellings) => spellings === null)
    ? null
    : reached.flatMap((spellings) => (spellings ?? []).map((spelling) => ({ ...spelling, property })));
}

// A type parameter scoped to a property: what instantiates it, else its constraint. A parameter bound to a literal key
// spells no type to find a property in.
function parameterSteps(world: NativeWorld, { property, bindings }: ScopedTo, parameter: TypeParameterDeclaration): readonly Scoped[] | null {
  const binding = bindings.get(siteKey(world.siteOf(parameter.name)));
  if (binding === undefined) {
    return parameter.constraint === undefined ? null : [{ node: parameter.constraint, bindings, property }];
  }
  return binding.spellings === null || binding.spellings.length === 0 ? null : binding.spellings.map((spelling) => ({ ...spelling, property }));
}

// A library type scoped to a property: `Readonly`, `Partial` and `Required` keep their argument's members, and
// `Record<K, V>` types every member `V`. Any other library type has no member a written descent can read.
function libraryTypeSteps({ property, bindings }: ScopedTo, node: TypeReferenceNode, name: Identifier): readonly Scoped[] | null {
  const [first, second] = node.typeArguments ?? [];
  if (TRANSPARENT_MAPPERS.has(name.text) && first !== undefined) {
    return [{ node: first, bindings, property }];
  }
  return name.text === RECORD && second !== undefined ? [{ node: second, bindings, property: null }] : null;
}

// The property of a type no written member names (`z.output<typeof schema>["p"]`, `Awaited<ReturnType<F>>[number]["p"]`):
// the declaration the checker finds it by on the type the node denotes, read under that type's instantiation; null when
// a declaration is outside the production sources or spells nothing.
function* declaredPropertyOf(world: NativeWorld, { node, property }: ScopedTo): APIRequestGenerator<readonly Scoped[] | null> {
  const found = yield* propertyOn(world, yield* constituents(yield* world.checker.getTypeAtLocation.gen(node)), property);
  const spellings = found.sites.map((site) => {
    const declaration = declarationAt(world, site);
    return declaration === null ? undefined : propertySpelling(declaration);
  });
  if ((spellings.length === 0 && found.templates.length === 0) || spellings.includes(undefined)) {
    return null;
  }
  const bindings = yield* ownerBindings(world, found.owners);
  return [
    ...spellings.flatMap((spelled) => (spelled === undefined ? [] : [{ node: spelled, property: null, bindings }])),
    ...found.templates.map((template) => ({ node: template.node, property: null, bindings: merged(bindings, template.bindings) })),
  ];
}

// A reach's bindings, by what each binds: a node read under other instantiations is another reach.
const bindingsKey = (bindings: Bindings): string =>
  [...bindings]
    .map(([key, { spellings, index }]) => `${key}=${(spellings ?? []).map(({ node }) => nodeKey(node)).join("|")}@${index?.join(",") ?? ""}`)
    .sort()
    .join(";");

// Whether `reach` is new, recording it.
function firstVisit(seen: Map<string, Set<string>>, reach: Reach): boolean {
  const key = `${reach.property ?? ""}:${String(reach.collect)}:${(reach.positions ?? NO_POSITIONS).map(String).join(",")}:${bindingsKey(reach.bindings)}`;
  const at = nodeKey(reach.node);
  const held = seen.get(at) ?? new Set<string>();
  if (held.has(key)) {
    return false;
  }
  held.add(key);
  seen.set(at, held);
  return true;
}

// The tuples a slot's spellings reach, and the literal types written on the way: a variable reached through `typeof` or
// by name is a tuple, and aliases, schema values, constraints and function bodies are read through. `T["p"]` reads only
// `T`'s property `p`, so a sibling property's literals never re-spell the slot. A type parameter reads its binding. Null
// when a type name has no declaration, a type parameter has no binding, or the reading outgrows the limit.
function* originsOf(world: NativeWorld, spellings: readonly Spelling[], reading: Reading = "slot"): APIRequestGenerator<Origins> {
  const into: Spelled & { readonly tuples: Set<string>; readonly literals: Map<string, string> } = { tuples: new Set(), literals: new Map() };
  const seen = new Map<string, Set<string>>();
  const pending: Reach[] = spellings.map((spelling) => ({ ...spelling, property: null, collect: true }));
  let visits = 0;
  for (let reach = pending.pop(); reach !== undefined; reach = pending.pop()) {
    if (!firstVisit(seen, reach)) {
      continue;
    }
    visits += 1;
    const next = visits > SPELLING_LIMIT ? null : yield* readReach(world, { reach, reading }, into);
    if (next === null) {
      return null;
    }
    pending.push(...next);
  }
  return into;
}

// The elements of a tuple type a position selects: every element when the position is unknown, the rest element's array
// element past the fixed ones; null for a rest that is no array type.
function tupleElements(node: TupleTypeNode, at: Position | undefined): readonly TypeNode[] | null {
  const unwrapped = node.elements.map((element) => (isNamedTupleMember(element) || isOptionalTypeNode(element) ? element.type : element));
  const chosen = at === null || at === undefined ? unwrapped : [unwrapped[Math.min(at, unwrapped.length - 1)]];
  const elements: TypeNode[] = [];
  for (const element of chosen) {
    if (element === undefined) {
      continue;
    }
    if (!isRestTypeNode(element)) {
      elements.push(element);
    } else if (isArrayTypeNode(element.type)) {
      elements.push(element.type.elementType);
    } else {
      return null;
    }
  }
  return elements;
}

const ARRAY_TYPE_NAMES: ReadonlySet<string> = new Set(["Array", "ReadonlyArray"]);

// The type a literal's first position selects from one written type: an array's or a tuple's element, through
// parentheses, `readonly`, unions, intersections and product aliases. Null for a type that cannot select, which reads
// whole.
function* positioned(world: NativeWorld, spelling: Spelling): APIRequestGenerator<readonly Spelling[] | null> {
  const { node, bindings } = spelling;
  const [at, ...inner] = spelling.positions ?? NO_POSITIONS;
  const same = (nodes: readonly Node[]): Spelling[] => nodes.map((next) => ({ ...spelling, node: next }));
  const element = (nodes: readonly Node[] | null): Spelling[] | null =>
    nodes === null ? null : nodes.map((next) => ({ node: next, bindings, positions: inner }));
  if (isParenthesizedTypeNode(node) || (isTypeOperatorNode(node) && node.operator === SyntaxKind.ReadonlyKeyword)) {
    return same([node.type]);
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return same(node.types);
  }
  if (isArrayTypeNode(node)) {
    return element([node.elementType]);
  }
  if (isTupleTypeNode(node)) {
    return element(tupleElements(node, at));
  }
  const name = referredName(node);
  if (name === null || !isTypeReferenceNode(node)) {
    return null;
  }
  const [first] = node.typeArguments ?? [];
  if (first !== undefined && ARRAY_TYPE_NAMES.has(name.text) && (yield* isLibReference(world, name))) {
    return element([first]);
  }
  return yield* aliasFollowed(world, spelling, name);
}

// A reference to product aliases, read at what they alias; null when a declaration is no alias.
function* aliasFollowed(world: NativeWorld, spelling: Spelling, name: Identifier): APIRequestGenerator<readonly Spelling[] | null> {
  const declarations = (yield* declaredSites(world, name)).map((site) => declarationAt(world, site));
  const aliases = declarations.filter((declaration) => declaration !== null && isTypeAliasDeclaration(declaration));
  if (aliases.length === 0 || aliases.length !== declarations.length) {
    return null;
  }
  const followed: Spelling[] = [];
  for (const alias of aliases) {
    followed.push({ ...spelling, node: alias.type, bindings: yield* typeArgumentBindings(world, name, alias.typeParameters ?? [], spelling.bindings) });
  }
  return followed;
}

// Read one reach into `into`: the reaches it leads to, or null when the slot reading gives up.
function* readReach(
  world: NativeWorld,
  { reach, reading }: { readonly reach: Reach; readonly reading: Reading },
  into: { readonly tuples: Set<string>; readonly literals: Map<string, string> },
): APIRequestGenerator<readonly Reach[] | null> {
  const { node, property, collect } = reach;
  if (property !== null) {
    return yield* scopedReaches(world, reach, property);
  }
  const selected = isNested(reach.positions) ? yield* positioned(world, reach) : null;
  if (selected !== null) {
    return selected.map((next) => ({ ...next, property: null, collect }));
  }
  const read = yield* readSpelling(world, reach, reading);
  if (read === null) {
    return null;
  }
  for (const tuple of read.tuples) {
    into.tuples.add(tuple);
  }
  if (collect) {
    collectLiteralTypes(node, into.literals);
  }
  return [...read.next.map((next) => ({ ...next, property: null, collect })), ...read.scoped.map((scoped) => ({ ...scoped, collect }))];
}

function* declaredAt(world: NativeWorld, node: Node, role: LiteralRole | "record-key"): APIRequestGenerator<Declared> {
  const { parent } = node;
  switch (role) {
    case "construct":
      return yield* receivingSpellings(world, node);
    case "record-key": {
      const object = keyedObject(node);
      return object === undefined ? null : yield* receivingSpellings(world, object);
    }
    case "case":
      return isCaseClause(parent) && isSwitchStatement(parent.parent.parent) ? yield* operandSpellings(world, parent.parent.parent.expression) : null;
    case "compare":
      return isBinaryExpression(parent) ? yield* operandSpellings(world, sameNode(parent.left, node) ? parent.right : parent.left) : null;
    case "key":
    case "type":
    case "module":
      return null;
  }
}

/** What the type a tuple declared at `name` satisfies is spelled from, so `["a"] as const satisfies readonly P[]`
 *  reaches the tuples `P` derives from and theirs in turn, and the literal types `P` writes, which re-spell the
 *  tuple's members. Empty for a tuple with no `satisfies`, or one that cannot be read to the end. Spelled from is not
 *  subset of: a `keyof` or an indexed access reaches tuples it never holds. */
export function* satisfiedOrigins(world: NativeWorld, name: Identifier): APIRequestGenerator<Spelled> {
  const declaration = name.parent;
  const spellings: TypeNode[] = [];
  let node = isVariableDeclaration(declaration) ? declaration.initializer : undefined;
  while (node !== undefined && (isSatisfiesExpression(node) || isParenthesizedExpression(node) || isAsExpression(node))) {
    if (isSatisfiesExpression(node)) {
      spellings.push(node.type);
    }
    node = node.expression;
  }
  const origins = spellings.length === 0 ? null : yield* originsOf(world, spellings.map(unbound), "links");
  return origins ?? NOTHING_SPELLED;
}

// The object literal a key names a property of: a plain key's, or a computed key's (`["a"]: …`).
function keyedObject(key: Node): ObjectLiteralExpression | undefined {
  const name = isComputedPropertyName(key.parent) ? key.parent : key;
  const object = name.parent.parent;
  return isObjectLiteralExpression(object) ? object : undefined;
}

/** The tuples the slot of the literal or key at `site` derives from. */
export function* slotOrigins(world: NativeWorld, node: Node, role: LiteralRole | "record-key"): APIRequestGenerator<Origins> {
  const spellings = yield* declaredAt(world, node, role);
  return spellings === null ? null : yield* originsOf(world, spellings);
}

/** The slot a non-literal value at `site` flows into: a name, or the property a member access at `site` names, read
 *  into an argument, a property, a return or a binding, or used as the key of an element access. */
export function* valueSlotOrigins(world: NativeWorld, node: Node): APIRequestGenerator<Origins> {
  const value = isPropertyAccessExpression(node.parent) && sameNode(node.parent.name, node) ? node.parent : node;
  const { parent } = value;
  const spellings =
    isElementAccessExpression(parent) && sameNode(parent.argumentExpression, value)
      ? yield* operandSpellings(world, parent.expression)
      : yield* receivingSpellings(world, value);
  return spellings === null ? null : yield* originsOf(world, spellings);
}

/** The vocabulary of the value a switch at a name or member access reads: what its declaration is annotated with. */
export function* subjectOrigins(world: NativeWorld, node: Node): APIRequestGenerator<Origins> {
  const operand = isPropertyAccessExpression(node.parent) && sameNode(node.parent.name, node) ? node.parent : node;
  const spellings = yield* operandSpellings(world, operand);
  return spellings === null ? null : yield* originsOf(world, spellings);
}

/** The property signature a string literal type at `site` annotates, through a union of literals (`kind: "a" | "b"`):
 *  the site and text of its name. */
export function respelledProperty(world: NativeWorld, literal: Node): { readonly site: Site; readonly name: string } | null {
  let at = literal.parent;
  if (!isLiteralTypeNode(at)) {
    return null;
  }
  while (isUnionTypeNode(at.parent) || isParenthesizedTypeNode(at.parent)) {
    at = at.parent;
  }
  const { parent } = at;
  return isPropertySignatureDeclaration(parent) && sameNode(parent.type, at) && isIdentifier(parent.name)
    ? { site: world.siteOf(parent.name), name: parent.name.text }
    : null;
}

/** A switch on a name or a member access whose clause hands the switched value on: the string labels of the clause and
 *  the ones that fall into it, and each place the clause body reads the same value, by the site of its last name. */
export interface PassThrough {
  readonly labels: readonly string[];
  /** A read of the switched value, by its last name. */
  readonly value: Node;
  /** The switch subject, by its last name. */
  readonly subject: Node;
}

const isNamePath = (node: Expression): boolean => isIdentifier(node) || (isPropertyAccessExpression(node) && isNamePath(node.expression));

// Reads in `body` spelled `text` that hand the whole value on, not the object of a deeper access.
function sameValueReads(body: readonly Statement[], text: string): readonly Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if ((isIdentifier(node) || isPropertyAccessExpression(node)) && isNamePath(node) && node.getText() === text) {
      const { parent } = node;
      const deeper = (isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && sameNode(parent.expression, node);
      if (!deeper) {
        found.push(isPropertyAccessExpression(node) ? node.name : node);
      }
      return;
    }
    node.forEachChild(visit);
  };
  for (const statement of body) {
    visit(statement);
  }
  return found;
}

/** The clauses of the switch at `site` that hand the switched value on, each with the labels that narrow it there. */
export function switchPassThroughs(node: Node): readonly PassThrough[] {
  if (!isSwitchStatement(node)) {
    return [];
  }
  let subject: Expression = node.expression;
  while (isParenthesizedExpression(subject)) {
    subject = subject.expression;
  }
  if (!isNamePath(subject)) {
    return [];
  }
  const text = subject.getText();
  const subjectName = isPropertyAccessExpression(subject) ? subject.name : subject;
  const found: PassThrough[] = [];
  let labels: string[] = [];
  for (const clause of node.caseBlock.clauses) {
    if (isDefaultClause(clause)) {
      labels = [];
      continue;
    }
    if (isStringLiteral(clause.expression)) {
      labels.push(clause.expression.text);
    }
    if (clause.statements.length > 0) {
      const narrowed = labels;
      found.push(...sameValueReads(clause.statements, text).map((value) => ({ labels: narrowed, value, subject: subjectName })));
      labels = [];
    }
  }
  return found;
}

// Type names every lib declares that select keys: `Pick<T, K>` and `Omit<T, K>` take the keys second, and
// `Exclude<keyof T, K>` and `Extract<keyof T, K>` filter a key set by them.
const KEY_SELECTORS: ReadonlySet<string> = new Set(["Pick", "Omit"]);
const KEY_FILTERS: ReadonlySet<string> = new Set(["Exclude", "Extract"]);

/** Whether a type name is one of the lib key selections {@link keyListTuples} reads. */
export const isKeyTypeName = (name: string): boolean => KEY_SELECTORS.has(name) || KEY_FILTERS.has(name);

const isKeyof = (node: TypeNode | undefined): boolean => node !== undefined && isTypeOperatorNode(node) && node.operator === SyntaxKind.KeyOfKeyword;

// A lib type reference: no declaration of its name lies in the production sources. An engine may report a lib
// declaration or none at all, so only a production declaration rules the name out.
function* isLibReference(world: NativeWorld, name: Identifier): APIRequestGenerator<boolean> {
  const sites = yield* declaredSites(world, name);
  return sites.every((site) => !productReader(site.file));
}

// The key set a key position spells, reduced to the type nodes that name its keys.
function* keyNodes(world: NativeWorld, node: TypeNode): APIRequestGenerator<readonly TypeNode[]> {
  if (isUnionTypeNode(node)) {
    return node.types;
  }
  if (isParenthesizedTypeNode(node)) {
    return [node.type];
  }
  if (isTypeReferenceNode(node) && isIdentifier(node.typeName) && KEY_FILTERS.has(node.typeName.text) && (yield* isLibReference(world, node.typeName))) {
    const [from, by] = node.typeArguments ?? [];
    const kept = isKeyof(from) ? by : from;
    return kept === undefined ? [] : [kept];
  }
  return [];
}

// The tuples `(typeof T)[number]` reads: each variable `T` resolves to.
function* queriedTuples(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly string[]> {
  const tuples: string[] = [];
  for (const site of yield* declaredSites(world, name)) {
    const declaration = declarationAt(world, site);
    if (declaration !== null && isVariableDeclaration(declaration) && isIdentifier(declaration.name)) {
      tuples.push(`${site.file}:${declaration.name.text}`);
    }
  }
  return tuples;
}

// The type nodes of the aliases a type name resolves to.
function* aliasedTypes(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly TypeNode[]> {
  const aliases: TypeNode[] = [];
  for (const site of yield* declaredSites(world, name)) {
    const declaration = declarationAt(world, site);
    if (declaration !== null && isTypeAliasDeclaration(declaration)) {
      aliases.push(declaration.type);
    }
  }
  return aliases;
}

function unparenthesized(node: TypeNode): TypeNode {
  let at = node;
  while (isParenthesizedTypeNode(at)) {
    at = at.type;
  }
  return at;
}

// One key-position node: the tuples `(typeof T)[number]` names, added to `tuples`, or the nodes it reads through.
function* keyStep(world: NativeWorld, node: TypeNode, tuples: Set<string>): APIRequestGenerator<readonly TypeNode[]> {
  const queried = isIndexedAccessTypeNode(node) ? unparenthesized(node.objectType) : undefined;
  if (queried !== undefined && isTypeQueryNode(queried) && isIdentifier(queried.exprName)) {
    for (const tuple of yield* queriedTuples(world, queried.exprName)) {
      tuples.add(tuple);
    }
    return [];
  }
  if (isTypeReferenceNode(node) && isIdentifier(node.typeName) && !KEY_FILTERS.has(node.typeName.text)) {
    return yield* aliasedTypes(world, node.typeName);
  }
  return yield* keyNodes(world, node);
}

// The tuples a key position names: `(typeof T)[number]`, an alias of one, a union of them and a filter of them.
function* keyTuples(world: NativeWorld, start: TypeNode): APIRequestGenerator<ReadonlySet<string>> {
  const tuples = new Set<string>();
  const seen = new Set<string>();
  const pending: TypeNode[] = [start];
  for (let node = pending.pop(); node !== undefined && seen.size <= SPELLING_LIMIT; node = pending.pop()) {
    if (!seen.has(nodeKey(node))) {
      seen.add(nodeKey(node));
      pending.push(...(yield* keyStep(world, node, tuples)));
    }
  }
  return tuples;
}

/** The tuples a lib key selection whose type name sits at `site` uses as keys: the `K` of `Pick<T, K>` or
 *  `Omit<T, K>`, or of `Exclude<keyof T, K>`. Such a tuple names property keys of a type, never a value. */
export function* keyListTuples(world: NativeWorld, name: Node): APIRequestGenerator<ReadonlySet<string>> {
  const reference = name.parent;
  if (!(isIdentifier(name) && isTypeReferenceNode(reference) && (yield* isLibReference(world, name)))) {
    return NOTHING_SPELLED.tuples;
  }
  const [first, key] = reference.typeArguments ?? [];
  const selects = KEY_SELECTORS.has(name.text);
  // `Pick<T, Exclude<keyof T, K>>` is read at its `Exclude`, which is a key filter of its own.
  const filtered = selects && key !== undefined && isTypeReferenceNode(key) && isKeyof(key.typeArguments?.[0]);
  if (key === undefined || filtered || !(selects || isKeyof(first))) {
    return NOTHING_SPELLED.tuples;
  }
  return yield* keyTuples(world, key);
}

// A parameter type that holds raw outside input: `string` or `unknown`, optionally with `undefined` or `null`.
const RAW_INPUT: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.StringKeyword, SyntaxKind.UnknownKeyword]);
const ABSENT: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.UndefinedKeyword, SyntaxKind.NullKeyword, SyntaxKind.LiteralType]);

function isRawInput(type: TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  const members = isUnionTypeNode(type) ? type.types : [type];
  return members.some((member) => RAW_INPUT.has(member.kind)) && members.every((member) => RAW_INPUT.has(member.kind) || ABSENT.has(member.kind));
}

/** The tuples a type guard at `site` (`(value: string): value is T`) narrows a raw string or unknown parameter into:
 *  outside input can then produce any of their members. */
export function* predicateTuples(world: NativeWorld, predicate: Node): APIRequestGenerator<ReadonlySet<string>> {
  if (!isTypePredicateNode(predicate) || predicate.type === undefined || predicate.assertsModifier !== undefined) {
    return NOTHING_SPELLED.tuples;
  }
  const guarded = predicate.parameterName;
  const signature = predicate.parent;
  const parameter = isSigned(signature)
    ? signature.parameters.find((candidate) => isIdentifier(candidate.name) && isIdentifier(guarded) && candidate.name.text === guarded.text)
    : undefined;
  if (!isRawInput(parameter?.type)) {
    return NOTHING_SPELLED.tuples;
  }
  const origins = yield* originsOf(world, [unbound(predicate.type)]);
  return origins?.tuples ?? NOTHING_SPELLED.tuples;
}
