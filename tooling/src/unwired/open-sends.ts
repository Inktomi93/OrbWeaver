// Where a value handed into an open slot goes. A slot that names no member (unknown, object, a string index) passes the
// value on, so the scan follows it: into a helper's body, to a logger, a serialization or a library. Inside the provider
// backends a value with no other destination is a provider send only when it reaches a request the backends make.
import type { CallExpression, Expression, NewExpression, Node } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isAwaitExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isConditionalExpression,
  isElementAccessExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isModuleBlock,
  isModuleDeclaration,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTypeAssertion,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all, IndexKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { SendDestination } from "./boundaries.ts";
import { PROVIDER_BODIES, serializedBy } from "./boundaries.ts";
import type { Site } from "./classify.ts";
import { handedAt } from "./handoffs.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys, hasFlag } from "./native.ts";
import { isProduction } from "./worlds.ts";

// A serialization sends nested members too: a response's `messages[].content` leaves with the response. Deep enough
// for a view holding a list of rows that hold one nested object.
const SEND_DEPTH = 4;
// Helpers a value passes through before it leaves: a sink that wraps a logger that wraps pino.
const CHASE_DEPTH = 3;

/** A value sent out of the process, the declaration keys it carries, and who receives it when the scan can name it. */
interface OpenSend {
  readonly site: Site;
  readonly destination: SendDestination;
  readonly receiver: string | null;
  readonly keys: readonly string[];
}

interface Destination {
  readonly destination: SendDestination;
  readonly receiver: string | null;
}

const LOG_NAME = /^log(?:ger)?(?:$|[A-Z_])|Log(?:ger)?(?:$|[A-Z_])/u;
const LOG_METHODS: ReadonlySet<string> = new Set(["trace", "debug", "info", "warn", "error", "fatal", "log"]);
const WIRE_CALLS: ReadonlySet<string> = new Set(["send", "postMessage", "enqueue", "fetch"]);
// The AI SDK model calls that make a provider request; the rest of the SDK builds models or parses responses.
const REQUEST_METHODS: ReadonlySet<string> = new Set(["doStream", "doGenerate", "doEmbed"]);
const NODE_MODULES = "/node_modules/";
const TYPES_SCOPE = "@types/";
// The compiler's own lib files, which the native compiler ships under its platform package.
const COMPILER_PACKAGE = "typescript";
const COMPILER_SCOPE = "@typescript/";
// A Drizzle write is a column write, which counts only where a query reads the column back.
const COLUMN_PACKAGE = "drizzle-orm";

const isAiSdk = (pkg: string): boolean => pkg === "ai" || pkg.startsWith("@ai-sdk/");

/** The package a declaration outside the tree belongs to, `@types/x` read as `x`; null for a compiler lib file. */
function packageOf(path: string): string | null {
  const at = path.lastIndexOf(NODE_MODULES);
  if (at === -1) {
    return null;
  }
  const parts = path.slice(at + NODE_MODULES.length).split("/");
  const name = parts[0]?.startsWith("@") === true ? `${parts[0]}/${parts[1] ?? ""}` : (parts[0] ?? "");
  if (name === COMPILER_PACKAGE || name.startsWith(COMPILER_SCOPE)) {
    return null;
  }
  return name.startsWith(TYPES_SCOPE) ? name.slice(TYPES_SCOPE.length) : name;
}

// --- Held members -------------------------------------------------------------------------------------------

// The object types a value of `type` holds: itself or an array's element, each union member once.
function* heldObjects(checker: Checker, type: Type): APIRequestGenerator<readonly Type[]> {
  const plain = yield* checker.getNonNullableType.gen(type);
  const element = (yield* checker.isArrayType.gen(plain)) && plain.isTypeReference() ? (yield* checker.getTypeArguments.gen(plain))[0] : undefined;
  return (yield* constituents(element ?? plain)).filter((member) => hasFlag(member.flags, TypeFlags.Object) || hasFlag(member.flags, TypeFlags.Intersection));
}

/** The in-tree members a value carries, through nested objects and array elements, each with its name. */
function* heldNamed(world: NativeWorld, types: readonly Type[], levels: number): APIRequestGenerator<readonly NativeSymbol[]> {
  const { checker } = world;
  const found: NativeSymbol[] = [];
  const seen = new Set<number>();
  let pending = types;
  for (let depth = 0; depth < levels && pending.length > 0; depth++) {
    const held = (yield* all(...pending.map((type) => heldObjects(checker, type)))).flat();
    const objects = held.filter((type) => !seen.has(type.id));
    for (const type of objects) {
      seen.add(type.id);
    }
    const properties = (yield* all(...objects.map((type) => checker.getPropertiesOfType.gen(type))))
      .flat()
      .filter((property) => property.declarations.some((handle) => world.fileOf(handle) !== null));
    found.push(...properties);
    pending = properties.length === 0 ? [] : yield* checker.getTypeOfSymbol.gen(properties);
  }
  return found;
}

/** The declaration keys of every in-tree member a value carries, through nested objects and array elements. */
export function* heldMembers(world: NativeWorld, value: Node): APIRequestGenerator<readonly string[]> {
  const held = yield* heldNamed(world, [yield* world.checker.getTypeAtLocation.gen(value)], SEND_DEPTH);
  return held.flatMap((property) => declarationKeys(property));
}

// --- Open slots ---------------------------------------------------------------------------------------------

/** A slot no member names a key in: `unknown`, `object`, a type parameter bounded by one, or a type with an index
 *  signature such as `JSONObject` or `Record<string, unknown>`. An unbounded type parameter takes the value's own type. */
export function* isOpenType(checker: Checker, type: Type): APIRequestGenerator<boolean> {
  if (hasFlag(type.flags, TypeFlags.Unknown) || hasFlag(type.flags, TypeFlags.NonPrimitive)) {
    return true;
  }
  if (hasFlag(type.flags, TypeFlags.TypeParameter)) {
    const bound = yield* checker.getBaseConstraintOfType.gen(type);
    return bound !== undefined && bound.id !== type.id && (yield* isOpenType(checker, bound));
  }
  const members = yield* constituents(type);
  const infos = yield* all(...members.map((member) => checker.getIndexInfosOfType.gen(member)));
  return infos.some((list) => list.length > 0);
}

interface Handed {
  /** The handed value's members the slot does not name, with their nested members. */
  readonly keys: readonly string[];
  /** The string-indexed object types of the slot, which a literal element read of the value goes through. */
  readonly sinks: readonly number[];
  /** Every handed member by name, at any depth, for a literal element read through a sink. */
  readonly named: readonly NativeSymbol[];
}

const NOTHING: Handed = { keys: [], sinks: [], named: [] };

// The in-tree members a typed value hands to its open slot. A string-indexed slot takes the members it does not name;
// `unknown`, `object` or a bounded type parameter takes them all.
function* handedInto(world: NativeWorld, value: Node): APIRequestGenerator<Handed> {
  const { checker } = world;
  const slot = yield* checker.getContextualType.gen(value as Expression);
  if (slot === undefined) {
    return NOTHING;
  }
  const valueType = yield* checker.getTypeAtLocation.gen(value);
  if (hasFlag(valueType.flags, TypeFlags.Any)) {
    return NOTHING;
  }
  const sources = yield* heldObjects(checker, valueType);
  const properties = (yield* all(...sources.map((type) => checker.getPropertiesOfType.gen(type))))
    .flat()
    .filter((property) => property.declarations.some((handle) => world.fileOf(handle) !== null));
  if (properties.length === 0) {
    return NOTHING;
  }
  const slotObjects = yield* heldObjects(checker, slot);
  const indexes = yield* all(...slotObjects.map((type) => checker.getIndexInfoOfType.gen(type, IndexKind.String)));
  const indexed = slotObjects.filter((_, at) => indexes[at] !== undefined);
  const whole = indexed.length === 0 && (yield* isOpenType(checker, slot));
  if (indexed.length === 0 && !whole) {
    return NOTHING;
  }
  const named = yield* all(...properties.map((property) => all(...indexed.map((type) => checker.getPropertyOfType.gen(type, property.name)))));
  const unnamed = whole ? properties : properties.filter((_, at) => (named[at] ?? []).every((member) => member === undefined));
  if (unnamed.length === 0) {
    return NOTHING;
  }
  const nested = yield* heldNamed(world, yield* checker.getTypeOfSymbol.gen(unnamed), SEND_DEPTH - 1);
  return {
    keys: [...unnamed, ...nested].flatMap((property) => declarationKeys(property)),
    sinks: indexed.map((type) => type.id),
    named: [...properties, ...(yield* heldNamed(world, yield* checker.getTypeOfSymbol.gen(properties), SEND_DEPTH - 1))],
  };
}

// --- Where a handed value goes ------------------------------------------------------------------------------

type Invocation = CallExpression | NewExpression;

const isWrapper = (parent: Node, node: Node): boolean =>
  isArrayLiteralExpression(parent) ||
  isSpreadElement(parent) ||
  isParenthesizedExpression(parent) ||
  isAsExpression(parent) ||
  isSatisfiesExpression(parent) ||
  isNonNullExpression(parent) ||
  isTypeAssertion(parent) ||
  isAwaitExpression(parent) ||
  (isConditionalExpression(parent) && parent.condition !== node) ||
  (isBinaryExpression(parent) && (parent.operatorToken.kind === SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === SyntaxKind.BarBarToken));

// The expression that carries a value one step on: the literal its key or spread sits in, or a wrapper around it.
function carriedUp(node: Node): Node | null {
  const { parent } = node;
  if ((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isSpreadAssignment(parent)) && isObjectLiteralExpression(parent.parent)) {
    return parent.parent;
  }
  return isWrapper(parent, node) ? parent : null;
}

// The call a value is an argument of, up through the literals, spreads, wrappers and branches that carry it there.
function carrierOf(start: Node): { readonly call: Invocation; readonly index: number } | null {
  let node = start;
  for (let up = carriedUp(node); up !== null; up = carriedUp(node)) {
    node = up;
  }
  const { parent } = node;
  if (!(isCallExpression(parent) || isNewExpression(parent)) || parent.expression === node) {
    return null;
  }
  const index = [...(parent.arguments ?? [])].findIndex((argument) => argument === node);
  return index === -1 ? null : { call: parent, index };
}

// The name a callee is spelled by: `f`, `x.f`, or the receiver of `log[level]`.
function calleeOf(call: Invocation): { readonly name: Node | null; readonly text: string | null; readonly receiver: Node | null } {
  const callee = call.expression;
  if (isIdentifier(callee)) {
    return { name: callee, text: callee.text, receiver: null };
  }
  if (isPropertyAccessExpression(callee)) {
    return { name: callee.name, text: callee.name.text, receiver: callee.expression };
  }
  return isElementAccessExpression(callee) ? { name: null, text: null, receiver: callee.expression } : { name: null, text: null, receiver: null };
}

// The last name a receiver goes by: `logger` in `ctx.logger`, `getLog` in `getLog(base)`.
function lastName(node: Node | null): string | null {
  if (node === null) {
    return null;
  }
  if (isIdentifier(node)) {
    return node.text;
  }
  if (isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  return isCallExpression(node) ? lastName(node.expression) : null;
}

// A call into a logger: its name, its receiver's name or its receiver's type names one.
function* isLogCall(world: NativeWorld, call: Invocation): APIRequestGenerator<boolean> {
  const { text, receiver } = calleeOf(call);
  const receiverText = lastName(receiver);
  if (receiverText === "console") {
    return true;
  }
  const typeName = receiver === null ? null : (yield* (yield* world.checker.getTypeAtLocation.gen(receiver)).getSymbol.gen())?.name;
  return (
    [text, receiverText, typeName ?? null].some((name) => name !== null && LOG_NAME.test(name)) ||
    (text !== null && LOG_METHODS.has(text) && receiverText !== null && LOG_NAME.test(receiverText))
  );
}

function* symbolOf(world: NativeWorld, node: Node): APIRequestGenerator<NativeSymbol | undefined> {
  const symbol = yield* world.checker.getSymbolAtLocation.gen(node);
  if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
    return symbol;
  }
  const target = yield* world.checker.getAliasedSymbol.gen(symbol);
  return (yield* world.checker.isUnknownSymbol.gen(target)) ? undefined : target;
}

type FunctionLike = Node & { readonly parameters: readonly Node[]; readonly body?: Node | undefined };

const isFunctionLike = (node: Node): node is FunctionLike =>
  isFunctionDeclaration(node) || isFunctionExpression(node) || isArrowFunction(node) || isMethodDeclaration(node);

// The function a declaration names: its own body, or the function a binding or a key holds.
function functionOf(node: Node): FunctionLike | null {
  if (isFunctionLike(node)) {
    return node.body === undefined ? null : node;
  }
  const value = isVariableDeclaration(node) || isPropertyAssignment(node) ? node.initializer : undefined;
  return value !== undefined && isFunctionLike(value) ? value : null;
}

// The identifiers in a body that read the parameter of that name, outside nested functions that rebind it.
function usesOf(body: Node, name: string): readonly Node[] {
  const uses: Node[] = [];
  const visit = (node: Node): void => {
    if (isIdentifier(node) && node.text === name && !(isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
      uses.push(node);
    }
    node.forEachChild(visit);
  };
  body.forEachChild(visit);
  return uses;
}

function* resolved(handle: NodeHandle): APIRequestGenerator<Node | undefined> {
  return yield* handle.resolve.gen();
}

// A serialization or a constructor whose destination its callee alone names, or null for any other call.
function namedDestination(call: Invocation): readonly Destination[] | null {
  const text = call.expression.getText();
  if (isCallExpression(call) && text === "JSON.stringify") {
    const serialized = serializedBy(call);
    return serialized.whole ? [] : [{ destination: serialized.destination, receiver: null }];
  }
  if (text === "c.json") {
    return [{ destination: "http", receiver: null }];
  }
  const { text: name } = calleeOf(call);
  return isNewExpression(call) && name?.endsWith("Error") === true ? [{ destination: "error", receiver: name }] : null;
}

const wireCall = (call: Invocation): readonly Destination[] => {
  const { text } = calleeOf(call);
  return text !== null && WIRE_CALLS.has(text) ? [{ destination: "wire", receiver: text }] : [];
};

// A library slot typed `unknown` takes the value opaquely: a schema parse hands it back typed, React compares a
// dependency list by identity. Only a slot that takes keys (an index signature, `object`) reads members.
function* isOpaqueSlot(world: NativeWorld, argument: Node | undefined): APIRequestGenerator<boolean> {
  const slot = argument === undefined ? undefined : yield* world.checker.getContextualType.gen(argument as Expression);
  if (slot === undefined) {
    return true;
  }
  const element = (yield* world.checker.isArrayType.gen(slot)) && slot.isTypeReference() ? (yield* world.checker.getTypeArguments.gen(slot))[0] : undefined;
  return hasFlag((element ?? slot).flags, TypeFlags.Unknown);
}

// A library callee: the AI SDK makes provider requests, a logger logs, any other library that reads keys is a dependency.
function* libraryDestination(world: NativeWorld, call: Invocation, index: number, path: string): APIRequestGenerator<readonly Destination[]> {
  const pkg = packageOf(path);
  if (pkg === null) {
    return wireCall(call);
  }
  if (isAiSdk(pkg)) {
    return [{ destination: "provider", receiver: pkg }];
  }
  if (pkg === COLUMN_PACKAGE || (yield* isOpaqueSlot(world, (call.arguments ?? [])[index]))) {
    return [];
  }
  return [{ destination: (yield* isLogCall(world, call)) ? "log" : "dependency", receiver: pkg }];
}

// Where a value given to `call` at `index` goes: a serialization's destination, a library, a logger, or wherever the
// in-tree callee hands its parameter on.
function* callDestinations(world: NativeWorld, call: Invocation, index: number, depth: number): APIRequestGenerator<readonly Destination[]> {
  const named = namedDestination(call);
  if (named !== null) {
    return named;
  }
  const { name } = calleeOf(call);
  const declarations = (name === null ? undefined : yield* symbolOf(world, name))?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree === undefined && outside !== undefined) {
    return yield* libraryDestination(world, call, index, outside.path);
  }
  const declaration = inTree === undefined ? undefined : yield* resolved(inTree);
  const fn = declaration === undefined ? null : functionOf(declaration);
  const parameter = fn === null ? undefined : (fn.parameters[index] ?? fn.parameters.at(-1));
  if (fn?.body !== undefined && parameter !== undefined && isParameterDeclaration(parameter) && isIdentifier(parameter.name)) {
    const { body } = fn;
    const parameterName = parameter.name.text;
    return depth >= CHASE_DEPTH ? [] : (yield* all(...usesOf(body, parameterName).map((use) => destinationsOf(world, use, depth + 1)))).flat();
  }
  return (yield* isLogCall(world, call)) ? [{ destination: "log", receiver: call.expression.getText() }] : wireCall(call);
}

function* destinationsOf(world: NativeWorld, value: Node, depth: number): APIRequestGenerator<readonly Destination[]> {
  const carrier = carrierOf(value);
  return carrier === null ? [] : yield* callDestinations(world, carrier.call, carrier.index, depth);
}

// --- The provider request reach -----------------------------------------------------------------------------

const nodeKey = (world: NativeWorld, node: Node): string => `${world.siteOf(node).file}:${String(node.pos)}:${String(node.end)}`;

// The values a function gives back: an arrow's expression body and every returned expression outside nested functions.
function returnsOf(fn: FunctionLike): readonly Node[] {
  if (isArrowFunction(fn) && !isBlock(fn.body)) {
    return [fn.body];
  }
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if (isReturnStatement(node) && node.expression !== undefined) {
      found.push(node.expression);
    }
    if (!isFunctionLike(node)) {
      node.forEachChild(visit);
    }
  };
  fn.body?.forEachChild(visit);
  return found;
}

// The key a function is called by: the binding or key that holds it, or its own declaration.
function callableKey(world: NativeWorld, fn: Node): string {
  const { parent } = fn;
  const holder = (isVariableDeclaration(parent) || isPropertyAssignment(parent)) && parent.initializer === fn ? parent : fn;
  return nodeKey(world, holder);
}

interface Calls {
  readonly seeds: readonly Node[];
  readonly callers: ReadonlyMap<string, readonly Invocation[]>;
  readonly readers: ReadonlySet<string>;
}

interface Callee {
  readonly pkg: string | null;
  readonly declaration: Node | undefined;
}

function* calleeAt(world: NativeWorld, call: Invocation): APIRequestGenerator<Callee> {
  const { name } = calleeOf(call);
  const declarations = (name === null ? undefined : yield* symbolOf(world, name))?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree !== undefined) {
    return { pkg: null, declaration: yield* resolved(inTree) };
  }
  return { pkg: outside === undefined ? null : packageOf(outside.path), declaration: undefined };
}

// The request carriers a call holds: an AI SDK model request's arguments and a `fetch` call's body.
function seedsOf(call: Invocation, { pkg }: Callee): readonly Node[] {
  const { text } = calleeOf(call);
  if (pkg !== null && isAiSdk(pkg) && text !== null && REQUEST_METHODS.has(text)) {
    return [...(call.arguments ?? [])];
  }
  const [, init] = call.arguments ?? [];
  if (text !== "fetch" || init === undefined) {
    return [];
  }
  const body = isObjectLiteralExpression(init)
    ? init.properties.find((property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === "body")
    : undefined;
  return [body !== undefined && isPropertyAssignment(body) ? body.initializer : init];
}

// A Fetch `Response` parameter: the function reads what a provider sent back.
const RESPONSE = "Response";

interface Backends {
  readonly calls: readonly Invocation[];
  readonly functions: readonly FunctionLike[];
}

function backendNodes(world: NativeWorld, files: ReadonlySet<string>): Backends {
  const calls: Invocation[] = [];
  const functions: FunctionLike[] = [];
  for (const file of world.files.filter((source) => files.has(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      if (isCallExpression(node) || isNewExpression(node)) {
        calls.push(node);
      } else if (isFunctionLike(node) && node.parameters.length > 0) {
        functions.push(node);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return { calls, functions };
}

function* readsResponse(world: NativeWorld, fn: FunctionLike): APIRequestGenerator<boolean> {
  const types = yield* all(...fn.parameters.map((parameter) => world.checker.getTypeAtLocation.gen(parameter)));
  const symbols = yield* all(...types.map((type) => type.getSymbol.gen()));
  return symbols.some((symbol) => symbol?.name === RESPONSE && symbol.declarations.every((handle) => world.fileOf(handle) === null));
}

// The request carriers of the backends, every call of an in-tree function by the key its callee is declared at, and
// the functions that read a provider `Response`, whose results are never request values.
function backendCalls(world: NativeWorld, files: ReadonlySet<string>): Calls {
  const { calls, functions } = backendNodes(world, files);
  const callees = world.batch(calls.map((call) => calleeAt(world, call)));
  const callers = new Map<string, Invocation[]>();
  for (const [at, call] of calls.entries()) {
    const declaration = callees[at]?.declaration;
    if (declaration !== undefined && functionOf(declaration) !== null) {
      const key = nodeKey(world, declaration);
      callers.set(key, [...(callers.get(key) ?? []), call]);
    }
  }
  const reading = world.batch(functions.map((fn) => readsResponse(world, fn)));
  return {
    seeds: calls.flatMap((call, at) => seedsOf(call, callees[at] ?? { pkg: null, declaration: undefined })),
    callers,
    readers: new Set(functions.filter((_, at) => reading[at] === true).map((fn) => nodeKey(world, fn))),
  };
}

// The declaration a name reads its value from: a shorthand key's value binding, or the name's own symbol.
function* declarationOf(world: NativeWorld, name: Node, files: ReadonlySet<string>): APIRequestGenerator<Node | undefined> {
  const symbol = isShorthandPropertyAssignment(name) ? yield* world.checker.getShorthandAssignmentValueSymbol.gen(name) : yield* symbolOf(world, name);
  const handle = symbol?.valueDeclaration ?? symbol?.declarations[0];
  const file = handle === undefined ? null : world.fileOf(handle);
  return handle === undefined || file === null || !files.has(file) ? undefined : yield* resolved(handle);
}

// Every expression whose value reaches a provider request the backends make, chased back from each request carrier:
// through bindings, a parameter to its callers' arguments, a callee to what it returns, and a function value to its
// results. A function body is entered only through what it returns, and never for a function that reads a Response.
function requestReach(world: NativeWorld, home: ReadonlySet<string>): ReadonlySet<string> {
  const files = new Set([...home].filter((file) => file.startsWith(PROVIDER_BODIES)));
  if (files.size === 0) {
    return new Set();
  }
  const calls = backendCalls(world, files);
  const reached = new Set<string>();
  let pending: readonly Node[] = calls.seeds;
  while (pending.length > 0) {
    const names: Node[] = [];
    for (const node of pending) {
      markReached({ world, readers: calls.readers, reached, names }, node);
    }
    const declared = world.batch(names.map((name) => declarationOf(world, name, files)));
    pending = declared.flatMap((declaration) => (declaration === undefined ? [] : feeding(world, declaration, calls)));
  }
  return reached;
}

interface Marking {
  readonly world: NativeWorld;
  readonly readers: ReadonlySet<string>;
  readonly reached: Set<string>;
  /** The names met on the way, whose declarations feed the next round. */
  readonly names: Node[];
}

function markReached(marking: Marking, node: Node): void {
  const key = nodeKey(marking.world, node);
  if (marking.reached.has(key)) {
    return;
  }
  marking.reached.add(key);
  if (isFunctionLike(node)) {
    for (const result of marking.readers.has(key) ? [] : returnsOf(node)) {
      markReached(marking, result);
    }
    return;
  }
  if (isIdentifier(node) || isShorthandPropertyAssignment(node)) {
    marking.names.push(node);
  }
  node.forEachChild((child) => {
    markReached(marking, child);
  });
}

// The values written into a binding's keys after it is made, `out[key] = value` or `out.key = value`, in its scope.
function keyedWrites(declaration: Node & { readonly name: Node }): readonly Node[] {
  const { name } = declaration;
  if (!isIdentifier(name)) {
    return [];
  }
  let scope: Node = declaration.parent;
  while (!(isBlock(scope) || scope.kind === SyntaxKind.SourceFile)) {
    scope = scope.parent;
  }
  const found: Node[] = [];
  const visit = (node: Node): void => {
    const target = isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.EqualsToken ? node.left : undefined;
    const holder = target !== undefined && (isElementAccessExpression(target) || isPropertyAccessExpression(target)) ? target.expression : undefined;
    if (holder !== undefined && isIdentifier(holder) && holder.text === name.text && isBinaryExpression(node)) {
      found.push(node.right);
    }
    node.forEachChild(visit);
  };
  scope.forEachChild(visit);
  return found;
}

// The expressions that give a declaration its value.
function feeding(world: NativeWorld, declaration: Node, calls: Calls): readonly Node[] {
  const fn = functionOf(declaration);
  if (fn !== null) {
    return calls.readers.has(nodeKey(world, fn)) ? [] : returnsOf(fn);
  }
  if (isVariableDeclaration(declaration)) {
    return [...(declaration.initializer === undefined ? [] : [declaration.initializer]), ...keyedWrites(declaration)];
  }
  if (isBindingElement(declaration)) {
    let holder: Node = declaration.parent;
    while (!(isVariableDeclaration(holder) || isParameterDeclaration(holder)) && holder.kind !== SyntaxKind.SourceFile) {
      holder = holder.parent;
    }
    return feeding(world, holder, calls);
  }
  if (isParameterDeclaration(declaration) && isFunctionLike(declaration.parent)) {
    const owner = declaration.parent;
    const index = owner.parameters.indexOf(declaration);
    return (calls.callers.get(callableKey(world, owner)) ?? []).flatMap((call) => {
      const argument = (call.arguments ?? [])[index];
      return argument === undefined ? [] : [argument];
    });
  }
  return [];
}

// --- Assertions and module augmentations --------------------------------------------------------------------

// `tree as MarkdownNode` on a parameter a library typed: the library hands the object in and reads it back, so the
// asserted type's in-tree members are that library's. On a returned closure's `unknown` parameter the receiver is the
// unseen caller of the factory.
function* assertedSend(world: NativeWorld, assertion: Node & { readonly expression: Expression }): APIRequestGenerator<OpenSend | null> {
  const { checker } = world;
  const operand = assertion.expression;
  if (!isIdentifier(operand)) {
    return null;
  }
  const symbol = yield* checker.getSymbolAtLocation.gen(operand);
  if (symbol?.valueDeclaration?.kind !== SyntaxKind.Parameter) {
    return null;
  }
  const operandType = yield* checker.getTypeAtLocation.gen(operand);
  const typed = yield* operandType.getSymbol.gen();
  const declarations = typed?.declarations ?? [];
  const pkg = declarations.length > 0 && declarations.every((handle) => world.fileOf(handle) === null) ? packageOf(declarations[0]?.path ?? "") : null;
  const caller = pkg === null && hasFlag(operandType.flags, TypeFlags.Unknown) ? yield* unseenCaller(world, symbol.valueDeclaration) : null;
  if (pkg === null && caller === null) {
    return null;
  }
  const keys = (yield* heldNamed(world, [yield* checker.getTypeAtLocation.gen(assertion)], SEND_DEPTH)).flatMap((property) => declarationKeys(property));
  if (keys.length === 0) {
    return null;
  }
  const site = world.siteOf(assertion);
  return pkg === null ? { site, destination: "unclassified", receiver: caller, keys } : { site, destination: "dependency", receiver: pkg, keys };
}

// The function a returned closure comes from, when the closure's `unknown` parameter is the one asserted: whoever calls
// the closure (a remark plugin's transformer, called by unified) hands the object in, and the scan cannot follow it.
function* unseenCaller(world: NativeWorld, handle: NodeHandle): APIRequestGenerator<string | null> {
  const parameter = world.fileOf(handle) === null ? undefined : yield* resolved(handle);
  const closure = parameter?.parent;
  const returned =
    closure !== undefined &&
    (isArrowFunction(closure) || isFunctionExpression(closure)) &&
    (isReturnStatement(closure.parent) || (isArrowFunction(closure.parent) && closure.parent.body === closure));
  if (!returned) {
    return null;
  }
  let factory: Node = closure.parent;
  while (!((isFunctionDeclaration(factory) || isVariableDeclaration(factory)) && factory.name !== undefined) && factory.kind !== SyntaxKind.SourceFile) {
    factory = factory.parent;
  }
  const named = factory as Node & { readonly name?: Node };
  return named.name !== undefined && isIdentifier(named.name) ? `caller of ${named.name.text}` : "caller of a returned closure";
}

// An interface inside `declare module "pkg"` is that library's: it reads every member at type level.
function augmentations(world: NativeWorld, home: ReadonlySet<string>): readonly OpenSend[] {
  const members: { readonly name: Node; readonly pkg: string }[] = [];
  for (const file of world.files.filter((source) => home.has(world.siteOf(source).file))) {
    file.forEachChild((statement) => {
      if (!(isModuleDeclaration(statement) && isStringLiteral(statement.name) && !statement.name.text.startsWith(".") && statement.body !== undefined)) {
        return;
      }
      const pkg = statement.name.text;
      const { body } = statement;
      for (const declaration of isModuleBlock(body) ? body.statements : []) {
        if (isInterfaceDeclaration(declaration)) {
          members.push(...declaration.members.flatMap((member) => (isPropertySignatureDeclaration(member) ? [{ name: member.name, pkg }] : [])));
        }
      }
    });
  }
  const symbols = world.symbolsAt(members.map(({ name }) => name));
  return members.flatMap(({ name, pkg }, at) => {
    const symbol = symbols[at];
    return symbol === undefined ? [] : [{ site: world.siteOf(name), destination: "dependency" as const, receiver: pkg, keys: declarationKeys(symbol) }];
  });
}

// --- The whole pass -----------------------------------------------------------------------------------------

/** A literal-key element read with no declaration, `row["tool_calls"]`, and the type it reads through. */
export interface LiteralRead {
  readonly site: Site;
  readonly receiver: Node;
  readonly name: string;
}

/** What a world's open slots send, and the members a literal element read through one of them reads. */
export interface OpenFacts {
  readonly sends: readonly OpenSend[];
  readonly reads: readonly { readonly site: Site; readonly keys: readonly string[] }[];
}

type Assertion = Node & { readonly expression: Expression };

// Every value a production file hands to a typed slot, and every assertion, whose operand is handed to the asserted type.
function handedValues(world: NativeWorld, files: ReadonlySet<string>): { readonly values: readonly Node[]; readonly assertions: readonly Assertion[] } {
  const values: Node[] = [];
  const assertions: Assertion[] = [];
  for (const file of world.files.filter((source) => files.has(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      if (isAsExpression(node) || isTypeAssertion(node)) {
        values.push(node.expression);
        assertions.push(node);
      } else {
        values.push(...handedAt(node).filter((value) => !isObjectLiteralExpression(value)));
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return { values, assertions };
}

// Each file's string-indexed sink types, with the members of every value handed into one, by name.
type Sinks = Map<string, Map<string, string[]>>;

function recordSinks(sinks: Sinks, file: string, into: Handed): void {
  for (const sink of into.sinks) {
    const key = `${file}|${String(sink)}`;
    const byName = sinks.get(key) ?? new Map<string, string[]>();
    for (const member of into.named) {
      byName.set(member.name, [...(byName.get(member.name) ?? []), ...declarationKeys(member)]);
    }
    sinks.set(key, byName);
  }
}

function sinkReads(world: NativeWorld, sinks: Sinks, literalReads: readonly LiteralRead[]): OpenFacts["reads"] {
  const receivers = world.batch(
    literalReads.map(function* ({ receiver }): APIRequestGenerator<readonly number[]> {
      const type = yield* world.checker.getNonNullableType.gen(yield* world.checker.getTypeAtLocation.gen(receiver));
      return (yield* constituents(type)).map((member) => member.id);
    }),
  );
  return literalReads.flatMap(({ site, name }, at) => {
    const keys = (receivers[at] ?? []).flatMap((id) => sinks.get(`${site.file}|${String(id)}`)?.get(name) ?? []);
    return keys.length === 0 ? [] : [{ site, keys: [...new Set(keys)] }];
  });
}

/** Every open-slot send of a world's production `home` files: a typed value handed into an open slot (`open` holds the
 *  open literal keys' values and open spreads, which send all their members), an assertion of a library's parameter,
 *  and a module augmentation. A literal element read on a value whose type a typed value was handed into in the same
 *  file reads that value's members of its name. */
export function openFacts(world: NativeWorld, home: ReadonlySet<string>, open: readonly Node[], literalReads: readonly LiteralRead[]): OpenFacts {
  const files = new Set([...home].filter(isProduction));
  const { values, assertions } = handedValues(world, files);
  const handed = [...open, ...values];
  const reach = requestReach(world, files);
  const openSet = new Set(open.map((node) => nodeKey(world, node)));
  const answers = world.batch(
    handed.map(function* (value): APIRequestGenerator<{ readonly into: Handed; readonly to: readonly Destination[] }> {
      const into = openSet.has(nodeKey(world, value)) ? { ...NOTHING, keys: yield* heldMembers(world, value) } : yield* handedInto(world, value);
      return { into, to: into.keys.length === 0 ? [] : yield* destinationsOf(world, value, 0) };
    }),
  );
  const sends: OpenSend[] = [];
  const sinks: Sinks = new Map();
  for (const [at, value] of handed.entries()) {
    const { into, to } = answers[at] ?? { into: NOTHING, to: [] };
    const site = world.siteOf(value);
    const requested = to.length === 0 && site.file.startsWith(PROVIDER_BODIES) && reach.has(nodeKey(world, value));
    for (const { destination, receiver } of requested ? [{ destination: "provider" as const, receiver: null }] : to) {
      sends.push({ site, destination, receiver, keys: into.keys });
    }
    recordSinks(sinks, site.file, into);
  }
  sends.push(...world.batch(assertions.map((assertion) => assertedSend(world, assertion))).flatMap((send) => (send === null ? [] : [send])));
  sends.push(...augmentations(world, files));
  return { sends, reads: sinkReads(world, sinks, literalReads) };
}
