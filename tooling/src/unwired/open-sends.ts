// Where a value handed into an open slot goes. A slot that names no member (unknown, object, a string index) passes the
// value on, so the chase follows it: into a helper's body, to a logger, a serialization or a library. Inside the
// provider backends a value with no other destination is a provider send only when it reaches a request the backends
// make.
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
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isIfStatement,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isTypeAssertion,
  isTypeOfExpression,
  isVariableDeclaration,
  isVoidExpression,
  isWhileStatement,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { SendDestination } from "./boundaries.ts";
import { NESTED_READS, PROVIDER_BODIES, serializedBy } from "./boundaries.ts";
import type { FunctionLike, NativeWorld } from "./native.ts";
import { constituents, hasFlag, isFunctionLike } from "./native.ts";

// Helpers a value passes through before it leaves: a sink that wraps a logger that wraps pino.
const CHASE_DEPTH = 3;

/** Where a sent value goes: the destination's kind and the library, logger or call that takes it, when one is named. */
export interface Destination {
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
  if (isCallExpression(call) && text === SERIALIZE) {
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

function* isOpaqueSlot(world: NativeWorld, argument: Node | undefined): APIRequestGenerator<boolean> {
  return yield* identitySlot(world, argument === undefined ? undefined : yield* world.checker.getContextualType.gen(argument as Expression));
}

/** Whether a library slot takes a value by identity: a slot typed `unknown`, or a list of `unknown`. A schema parse
 *  hands the value back typed, React compares a dependency list by identity. Only a slot that takes keys (an index
 *  signature, `object`) reads members. An optional parameter's slot carries `undefined` (`deps?: DependencyList`),
 *  which the check strips first. */
export function* identitySlot(world: NativeWorld, contextual: Type | undefined): APIRequestGenerator<boolean> {
  if (contextual === undefined || hasFlag(contextual.flags, TypeFlags.Unknown)) {
    return true;
  }
  // Only a union is stripped: the non-nullable form of `unknown` is `{}`, which would read as a keyed slot.
  const slot = hasFlag(contextual.flags, TypeFlags.Union) ? yield* world.checker.getNonNullableType.gen(contextual) : contextual;
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

/** Where a chased value goes. `dropped`: it reached an in-tree body that only consumes it, on every path (the value is
 *  tested, voided or left as a bare statement), so nothing receives it. A value returned, bound or stored is not
 *  followed, which is no drop. `read`: some path reads every member of the value in the process, a compared
 *  serialization or a dotted-path read ({@link NESTED_READS}). */
export interface Chase {
  readonly to: readonly Destination[];
  readonly dropped: boolean;
  readonly read: boolean;
}

const sentTo = (to: readonly Destination[]): Chase => ({ to, dropped: false, read: false });
const READ_WHOLE: Chase = { to: [], dropped: false, read: true };
const SERIALIZE = "JSON.stringify";

// A call that reads every member of the value it takes: a serialization whose string is compared, hashed or keyed, or
// a dotted-path reader's first argument.
function readsWhole(call: Invocation, index: number): boolean {
  if (isCallExpression(call) && call.expression.getText() === SERIALIZE) {
    return serializedBy(call).whole;
  }
  const { text } = calleeOf(call);
  return index === 0 && text !== null && NESTED_READS.has(text);
}

// Where a value given to `call` at `index` goes: a serialization's destination, a library, a logger, or wherever the
// in-tree callee hands its parameter on.
function* callDestinations(world: NativeWorld, call: Invocation, index: number, depth: number): APIRequestGenerator<Chase> {
  if (readsWhole(call, index)) {
    return READ_WHOLE;
  }
  const named = namedDestination(call);
  if (named !== null) {
    return sentTo(named);
  }
  const { name } = calleeOf(call);
  const declarations = (name === null ? undefined : yield* symbolOf(world, name))?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree === undefined && outside !== undefined) {
    return sentTo(yield* libraryDestination(world, call, index, outside.path));
  }
  const declaration = inTree === undefined ? undefined : yield* resolved(inTree);
  const fn = declaration === undefined ? null : functionOf(declaration);
  const parameter = fn === null ? undefined : (fn.parameters[index] ?? fn.parameters.at(-1));
  if (fn?.body !== undefined && parameter !== undefined && isParameterDeclaration(parameter) && isIdentifier(parameter.name)) {
    return depth >= CHASE_DEPTH ? sentTo([]) : yield* bodyChase(world, usesOf(fn.body, parameter.name.text), depth);
  }
  return sentTo((yield* isLogCall(world, call)) ? [{ destination: "log", receiver: call.expression.getText() }] : wireCall(call));
}

// Where an in-tree body's uses of its parameter take the value: every destination any use reaches, a read where any
// use reads it whole, and a drop only where every use drops it.
function* bodyChase(world: NativeWorld, uses: readonly Node[], depth: number): APIRequestGenerator<Chase> {
  const chased = yield* all(...uses.map((use) => destinationsOf(world, use, depth + 1)));
  const to = chased.flatMap((use) => use.to);
  const read = chased.some((use) => use.read);
  return { to, dropped: to.length === 0 && !read && chased.every((use) => use.dropped), read };
}

// A use that ends the value where it stands: a test, a `void`, a `typeof` or a bare statement. Any other position with
// no call to follow (a return, a binding, a store, a key's receiver) passes the value on unseen.
function consumedAt(value: Node): boolean {
  let node = value;
  for (let up = carriedUp(node); up !== null; up = carriedUp(node)) {
    node = up;
  }
  const { parent } = node;
  if (isVoidExpression(parent) || isTypeOfExpression(parent) || isExpressionStatement(parent) || isPrefixUnaryExpression(parent)) {
    return true;
  }
  if ((isIfStatement(parent) || isWhileStatement(parent)) && parent.expression === node) {
    return true;
  }
  return isBinaryExpression(parent) && CONSUMING_OPERATORS.has(parent.operatorToken.kind);
}

// The operators whose operands are only compared or tested; `??` and `||` hand an operand on (isWrapper).
const CONSUMING_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.InstanceOfKeyword,
  SyntaxKind.InKeyword,
]);

function* destinationsOf(world: NativeWorld, value: Node, depth: number): APIRequestGenerator<Chase> {
  const carrier = carrierOf(value);
  return carrier === null ? { to: [], dropped: consumedAt(value), read: false } : yield* callDestinations(world, carrier.call, carrier.index, depth);
}

/** Where a value handed on goes: the call it is an argument of, followed into an in-tree callee's body. */
export const sendChase = (world: NativeWorld, value: Node): APIRequestGenerator<Chase> => destinationsOf(world, value, 0);

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

/** The values that reach a provider request the backends make: only such a value is a provider send when no other
 *  destination takes it. */
export interface ProviderReach {
  readonly has: (node: Node) => boolean;
}

/** The provider request reach of a world's `home` files: empty unless some of them sit under {@link PROVIDER_BODIES}. */
export function providerReach(world: NativeWorld, home: ReadonlySet<string>): ProviderReach {
  const reached = requestReach(world, home);
  return { has: (node) => world.siteOf(node).file.startsWith(PROVIDER_BODIES) && reached.has(nodeKey(world, node)) };
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

// --- Assertions --------------------------------------------------------------------

/** An `as` or angle-bracket assertion: its operand is handed to the asserted type. */
export type Assertion = Node & { readonly expression: Expression };

/** `tree as MarkdownNode` on a parameter a library typed: the library hands the object in and reads it back, so the
 *  asserted type's in-tree members are sent to that library. On a returned closure's `unknown` parameter the receiver is
 *  the unseen caller of the factory. Null for any other assertion. */
export function* assertedDestination(world: NativeWorld, assertion: Assertion): APIRequestGenerator<Destination | null> {
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
  if (pkg !== null) {
    return { destination: "dependency", receiver: pkg };
  }
  const caller = hasFlag(operandType.flags, TypeFlags.Unknown) ? yield* unseenCaller(world, symbol.valueDeclaration) : null;
  return caller === null ? null : { destination: "unclassified", receiver: caller };
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
