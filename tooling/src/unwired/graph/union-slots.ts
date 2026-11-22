// Which tuples a string literal's slot takes its vocabulary from, read off what its declaration spells on the 7.1 tree of
// the graph session's merged program: a type annotation, or the schema value a type is inferred from. Types cannot
// say: a one-member union, an `Exclude` and a re-spelled subset all hold the same literals as the tuple.
//
// - A declaration is read only in a product file; one outside them (a library, a test) leaves its slot unreadable,
//   and an unreadable slot rules no tuple out.
// - Remote nodes are materialised per request, so a declaration a symbol names is read back as its site and found
//   again in the world's own parse of its file, and a walk keys what it has seen by span and kind, never by identity.
import type {
  ArrayLiteralExpression,
  ArrowFunction,
  AsExpression,
  CallExpression,
  ConstructorDeclaration,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  FunctionTypeNode,
  GetAccessorDeclaration,
  Identifier,
  IndexedAccessTypeNode,
  MethodDeclaration,
  MethodSignatureDeclaration,
  NewExpression,
  Node,
  ObjectLiteralExpression,
  ParameterDeclaration,
  PropertyName,
  SetAccessorDeclaration,
  Statement,
  TypeNode,
  VariableDeclaration,
} from "@typescript/native/ast";
import {
  getNameOfDeclaration,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isCaseClause,
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
  isInterfaceDeclaration,
  isIntersectionTypeNode,
  isLiteralTypeNode,
  isMappedTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
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
  isTypeAliasDeclaration,
  isTypeLiteralNode,
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
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Signature, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { Site } from "../classify.ts";
import type { NativeWorld } from "../native.ts";
import { constituents, hasFlag, propertiesNamed } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { LiteralRole } from "./roles.ts";
import { sameNode } from "./roles.ts";

/** What a slot's spellings reach: the tuples, as `file:NAME` keys, and the string literal types written on the way,
 *  each site key to its text. A literal type that re-spells a tuple member belongs to the tuple only where the scan
 *  links the two: the tuple `satisfies` a type that reaches it, or a value typed by it feeds the tuple's slot. */
export interface Spelled {
  readonly tuples: ReadonlySet<string>;
  readonly literals: ReadonlyMap<string, string>;
}

/** A slot's {@link Spelled} vocabulary; null when the slot's declaration cannot be read to the end, which no tuple may
 *  rule out. */
export type Origins = Spelled | null;

/** No tuple and no literal type. */
export const NOTHING_SPELLED: Spelled = { tuples: new Set(), literals: new Map() };

const CONST_ASSERTION = "const";

/** The innermost node whose own text starts at `site`, in the world's parse of its file; a string literal's site may
 *  start inside its quote. Undefined when no node starts there or the world holds no such file. */
export function nodeAt(world: NativeWorld, site: Site): Node | undefined {
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

// The declarations of property `name` in the contextual type of an object literal.
function* propertiesOf(world: NativeWorld, object: ObjectLiteralExpression, name: string): APIRequestGenerator<readonly Site[]> {
  const type = yield* world.checker.getContextualType.gen(object);
  const properties = type === undefined ? [] : yield* propertiesNamed(world.checker, type, name);
  return (yield* all(...properties.map((property) => symbolSites(world, property)))).flat();
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
    : { type: yield* world.checker.getTypeOfSymbol.gen(bound), signature, own };
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
  return declared === undefined ? undefined : { types: [declared.type], path };
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
function* uninferredPropertiesOf(world: NativeWorld, object: ObjectLiteralExpression, name: string): APIRequestGenerator<readonly Site[]> {
  const slot = yield* declaredSlot(world, object, []);
  if (slot === undefined) {
    return [];
  }
  let { types } = slot;
  for (const step of slot.path) {
    types = yield* propertyTypes(world.checker, types, step);
  }
  const settled = yield* settledTypes(world.checker, types);
  const properties = (yield* all(...settled.map((type) => world.checker.getPropertyOfType.gen(type, name)))).filter((property) => property !== undefined);
  return (yield* all(...properties.map((property) => symbolSites(world, property)))).flat();
}

// What a slot's declaration spells: type annotations, or the value expression a schema-inferred property is written from.
type Declared = readonly Node[] | null;

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
    return enclosingFunction(parent)?.type;
  }
  return isArrowFunction(parent) && sameNode(parent.body, node) ? parent.type : undefined;
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
  return isProduction(site.file) ? (nodeAt(world, site)?.parent ?? null) : null;
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
// the object, so the callee's declared parameter is the slot when it has the property.
function* propertySpellings(world: NativeWorld, name: string | null, object: ObjectLiteralExpression): APIRequestGenerator<Declared | undefined> {
  const contextual = name === null ? [] : yield* propertiesOf(world, object, name);
  const uninferred = name !== null && declaresWithin(world, contextual, object) ? yield* uninferredPropertiesOf(world, object, name) : [];
  const sites = uninferred.length > 0 ? uninferred : contextual;
  const spellings: Node[] = [];
  for (const site of sites) {
    const declaration = declarationAt(world, site);
    if (declaration === null) {
      return null;
    }
    const spelling = propertySpelling(declaration);
    if (spelling !== undefined) {
      spellings.push(spelling);
    }
  }
  return spellings.length === 0 ? undefined : spellings;
}

// A parameter the call types by the argument itself spells no vocabulary: the argument builds nothing there.
function* parameterSpellings(world: NativeWorld, argument: Node): APIRequestGenerator<Declared> {
  if (yield* infersFromArgument(world, argument)) {
    return [];
  }
  const site = yield* parameterOf(world, argument);
  const type = annotationOf(site === null ? null : declarationAt(world, site));
  return type === undefined ? null : [type];
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
  const spellings: Node[] = [];
  for (const use of referencedNames(declaration.getSourceFile()).filter(
    (name) => name.text === declaration.name.getText() && !sameNode(name, declaration.name),
  )) {
    const sites = yield* declaredSites(world, use);
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

// One step up from a value toward its slot: the slot's spellings when this parent decides them, else the node and
// property path to climb from next.
type Step = { readonly done: Declared } | { readonly node: Node; readonly path: readonly string[] };

function* receivingStep(world: NativeWorld, node: Node, path: readonly string[]): APIRequestGenerator<Step> {
  const { parent } = node;
  if (passesThrough(parent, node)) {
    return { node: parent, path };
  }
  const spelled = spelledFor(parent, node);
  if (spelled !== undefined) {
    return { done: [spelled] };
  }
  if (isArgument(parent, node)) {
    return { done: yield* parameterSpellings(world, node) };
  }
  if (isVariableDeclaration(parent)) {
    return { done: yield* constantSpellings(world, parent, path) };
  }
  return yield* objectStep(world, node, path);
}

// A value written into an object literal: a property's declared spelling, or the object's own slot further up.
function* objectStep(world: NativeWorld, node: Node, path: readonly string[]): APIRequestGenerator<Step> {
  const { parent } = node;
  if (isPropertyAssignment(parent) && sameNode(parent.initializer, node) && isObjectLiteralExpression(parent.parent)) {
    const name = propertyName(parent.name);
    const declared = yield* propertySpellings(world, name, parent.parent);
    return declared === undefined ? { node: parent.parent, path: name === null ? path : [name, ...path] } : { done: declared };
  }
  // `{ ...ROOT }`: the spread object's properties become the outer object's, so the path's first property is the slot.
  if (isSpreadAssignment(parent) && isObjectLiteralExpression(parent.parent) && path.length > 0) {
    const declared = yield* propertySpellings(world, path[0] ?? null, parent.parent);
    if (declared === undefined) {
      return { node: parent.parent, path };
    }
    return { done: path.length === 1 ? declared : null };
  }
  return { done: null };
}

// The spellings of the slot a value flows into. `path` names the properties, outermost first, from `start` down to the
// value asked about, when that value sits inside an unannotated object.
function* receivingSpellings(world: NativeWorld, start: Node, path: readonly string[] = []): APIRequestGenerator<Declared> {
  let step: Step = { node: start, path };
  while (!("done" in step)) {
    step = yield* receivingStep(world, step.node, step.path);
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
    return [node.type];
  }
  const name = isPropertyAccessExpression(node) ? node.name : node;
  if (!isIdentifier(name)) {
    return null;
  }
  const types: TypeNode[] = [];
  for (const site of yield* declaredSites(world, name)) {
    const type = annotationOf(declarationAt(world, site));
    if (type === undefined) {
      return null;
    }
    types.push(type);
  }
  return types.length === 0 ? null : types;
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
  /** The declaration is a type parameter, which a caller instantiates with a vocabulary this slot does not spell. */
  readonly opaque: boolean;
}

const NOTHING: Expansion = { tuple: null, into: [], opaque: false };

// What one declaration of a referenced name adds: a variable is a tuple and spells its annotation and value, an alias its
// type, a function its body, a property or parameter its annotation or value, an interface what it extends and holds.
function expansion(site: Site, declaration: Node | null): Expansion {
  if (declaration === null) {
    return NOTHING;
  }
  if (isVariableDeclaration(declaration)) {
    const tuple = isIdentifier(declaration.name) ? `${site.file}:${declaration.name.text}` : null;
    return { tuple, into: [declaration.type, declaration.initializer], opaque: false };
  }
  if (isTypeAliasDeclaration(declaration)) {
    return { tuple: null, into: [declaration.type], opaque: false };
  }
  if (isTypeParameterDeclaration(declaration)) {
    // A mapped type's key ranges over its constraint and no caller instantiates it, so the constraint is the vocabulary.
    return { tuple: null, into: [declaration.constraint], opaque: !isMappedTypeNode(declaration.parent) };
  }
  if (isFunctionDeclaration(declaration) || isMethodDeclaration(declaration)) {
    return { tuple: null, into: [declaration], opaque: false };
  }
  if (isInterfaceDeclaration(declaration)) {
    // A member's type is what an indexed access (`Interface["member"]`) reads.
    return { tuple: null, into: [...(declaration.heritageClauses ?? []), ...declaration.members.map(annotationOf)], opaque: false };
  }
  const written = isPropertyAssignment(declaration) || isPropertyDeclaration(declaration) ? declaration.initializer : undefined;
  return { tuple: null, into: [annotationOf(declaration), written], opaque: false };
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
interface Reach {
  readonly node: Node;
  readonly property: string | null;
  readonly collect: boolean;
}

interface Read {
  readonly tuples: readonly string[];
  readonly next: readonly Node[];
  /** The `T["p"]` accesses in the spelling, each read as `T` scoped to `p`. */
  readonly scoped: readonly { readonly node: Node; readonly property: string }[];
}

// How a reading treats a name it cannot settle: `slot` gives up, since the slot may then be any tuple's; `links` reads
// on past it, since a reading that only adds links to a tuple is sound with any part of them.
type Reading = "slot" | "links";

// The property an indexed access with a string literal index names: `T["p"]` gives `p`.
function indexedProperty(node: Node): string | null {
  return isIndexedAccessTypeNode(node) && isLiteralTypeNode(node.indexType) && isStringLiteral(node.indexType.literal) ? node.indexType.literal.text : null;
}

// The `T["p"]` accesses under `root`, by their object type: their names are read scoped, never whole.
function scopedAccesses(root: Node): readonly { readonly node: Node; readonly property: string }[] {
  const found: { readonly node: IndexedAccessTypeNode; readonly property: string }[] = [];
  const visit = (node: Node): void => {
    const property = indexedProperty(node);
    if (property !== null && isIndexedAccessTypeNode(node)) {
      found.push({ node, property });
      return;
    }
    node.forEachChild(visit);
  };
  visit(root);
  return found.map(({ node, property }) => ({ node: node.objectType, property }));
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
function* readSpelling(world: NativeWorld, root: Node, reading: Reading): APIRequestGenerator<Read | null> {
  const tuples: string[] = [];
  const next: Node[] = [];
  const scoped = scopedAccesses(root);
  const objects = new Set(scoped.map(({ node }) => nodeKey(node)));
  for (const name of referencedNames(root).filter((candidate) => !isUnder(candidate, objects))) {
    const reached = yield* expansionsOf(world, name);
    if (reading === "slot" && (reached === null || reached.some(({ opaque }) => opaque))) {
      return null;
    }
    for (const expanded of reached ?? []) {
      if (expanded.tuple !== null) {
        tuples.push(expanded.tuple);
      }
      next.push(...expanded.into.filter((spelling): spelling is Node => spelling !== undefined));
    }
  }
  return { tuples, next, scoped };
}

// The members named `property` in an interface or a type literal, and what an interface extends, still scoped to it.
function memberSteps(members: readonly Node[], property: string): readonly Scoped[] {
  return members.flatMap((member) =>
    isPropertySignatureDeclaration(member) && propertyName(member.name) === property ? [{ node: member.type, property: null }] : [],
  );
}

interface Scoped {
  readonly node: Node;
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
function* declaredPropertySteps(world: NativeWorld, name: Identifier, property: string): APIRequestGenerator<readonly Scoped[] | null> {
  const sites = yield* declaredSites(world, name);
  const steps: Scoped[] = [];
  for (const declaration of sites.map((site) => declarationAt(world, site))) {
    if (declaration !== null && isInterfaceDeclaration(declaration)) {
      const bases = (declaration.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => ({ node: type, property })));
      steps.push(...memberSteps(declaration.members, property), ...bases);
    } else if (declaration !== null && isTypeAliasDeclaration(declaration)) {
      steps.push({ node: declaration.type, property });
    } else {
      return null;
    }
  }
  return sites.length === 0 ? null : steps;
}

// One step of reading a type scoped to one property; null when the type is not one a property can be found in.
function* propertyStep(world: NativeWorld, node: Node, property: string): APIRequestGenerator<readonly Scoped[] | null> {
  if (isParenthesizedTypeNode(node)) {
    return [{ node: node.type, property }];
  }
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.map((type) => ({ node: type, property }));
  }
  if (isTypeLiteralNode(node)) {
    return memberSteps(node.members, property);
  }
  const name = referredName(node);
  return name === null ? null : yield* declaredPropertySteps(world, name, property);
}

// Every string literal type a spelling writes, by site key; a `T["p"]` access is read scoped, so its literals are not
// the spelling's own.
function collectLiteralTypes(root: Node, into: Map<string, string>): void {
  const visit = (node: Node): void => {
    if (indexedProperty(node) !== null) {
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
  const steps = yield* propertyStep(world, reach.node, property);
  return steps === null ? [{ node: reach.node, property: null, collect: false }] : steps.map((step) => ({ ...step, collect: reach.collect }));
}

// Whether `reach` is new, recording it.
function firstVisit(seen: Map<string, Set<string>>, reach: Reach): boolean {
  const key = `${reach.property ?? ""}:${String(reach.collect)}`;
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
// `T`'s property `p`, so a sibling property's literals never re-spell the slot. Null when a type name has no
// declaration, a type parameter stands in for the vocabulary, or the reading outgrows the limit: in each the slot may be
// any tuple's.
function* originsOf(world: NativeWorld, spellings: readonly Node[], reading: Reading = "slot"): APIRequestGenerator<Origins> {
  const into: Spelled & { readonly tuples: Set<string>; readonly literals: Map<string, string> } = { tuples: new Set(), literals: new Map() };
  const seen = new Map<string, Set<string>>();
  const pending: Reach[] = spellings.map((node) => ({ node, property: null, collect: true }));
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
  const read = yield* readSpelling(world, node, reading);
  if (read === null) {
    return null;
  }
  for (const tuple of read.tuples) {
    into.tuples.add(tuple);
  }
  if (collect) {
    collectLiteralTypes(node, into.literals);
  }
  return [...read.next.map((next) => ({ node: next, property: null, collect })), ...read.scoped.map((scoped) => ({ ...scoped, collect }))];
}

function* declaredAt(world: NativeWorld, node: Node, role: LiteralRole | "record-key"): APIRequestGenerator<Declared> {
  const { parent } = node;
  switch (role) {
    case "construct":
      return yield* receivingSpellings(world, node);
    case "record-key":
      return isObjectLiteralExpression(parent.parent) ? yield* receivingSpellings(world, parent.parent) : null;
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
  const origins = spellings.length === 0 ? null : yield* originsOf(world, spellings, "links");
  return origins ?? NOTHING_SPELLED;
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
  return sites.every((site) => !isProduction(site.file));
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
  const origins = yield* originsOf(world, [predicate.type]);
  return origins?.tuples ?? NOTHING_SPELLED.tuples;
}
