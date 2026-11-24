// Where a value handed into an open slot goes. A slot that names no member (unknown, object, a string index) passes the
// value on, so the chase follows it: into a helper's body, to a logger, a serialization or a library. Inside the
// provider backends a value with no other destination is a provider send only when it reaches a request the backends
// make.
//
// A serialization's string is chased as a value is: each place it reaches is judged by the declaration the checker
// resolves there, never by a spelling. A standard-library collection's key, a node:crypto input and a comparison read
// the whole value; a console, a file module, a platform request, a Drizzle `sql` tag, a platform response or blob and a
// construction whose type reaches the standard `Error` name a destination; an in-tree callee's body and a binding's
// uses are followed. A chase the depth bound stops is unclassified and counted, never a guessed destination.
//
// A log line is decided the same way: a platform `Console` member, a logging library's declaration, or an in-tree port
// whose product fills all resolve to one. A callee or receiver declared in the observability home is that destination.
// A callee spelled like a logger decides nothing.
import type { CallExpression, Expression, Identifier, InterfaceDeclaration, NewExpression, Node, VariableDeclaration } from "@typescript/native/ast";
import {
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isAwaitExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isClassDeclaration,
  isConditionalExpression,
  isElementAccessExpression,
  isExportSpecifier,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isIfStatement,
  isImportClause,
  isImportSpecifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isModuleDeclaration,
  isNewExpression,
  isNonNullExpression,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTaggedTemplateExpression,
  isTemplateExpression,
  isTemplateSpan,
  isThrowStatement,
  isTypeAssertion,
  isTypeOfExpression,
  isTypeOperatorNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVoidExpression,
  isWhileStatement,
  NodeFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, NodeHandle, SignatureUsage, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { SendDestination } from "./boundaries.ts";
import { NESTED_READS, OBSERVABILITY_HOME, PROVIDER_BODIES } from "./boundaries.ts";
import { methodCallOf, RESULTS } from "./list-methods.ts";
import type { FunctionLike, NativeWorld } from "./native.ts";
import { constituents, hasFlag, isFunctionLike, isPropertyName, propertiesNamed } from "./native.ts";
import { isProduction } from "./worlds.ts";

// Helpers a value passes through before it leaves: a sink that wraps a logger that wraps pino.
const CHASE_DEPTH = 3;

/** Where a sent value goes: the destination's kind and the library, logger or call that takes it, when one is named. */
export interface Destination {
  readonly destination: SendDestination;
  readonly receiver: string | null;
}

// The logging libraries, by the package that declares the callee: a call into one is a log line.
const LOG_PACKAGES: ReadonlySet<string> = new Set(["pino"]);
const CONSOLE_RECEIVER = "console";
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

// The outermost literal, spread, wrapper or branch that carries a value.
function carriedTop(start: Node): Node {
  let node = start;
  for (let up = carriedUp(node); up !== null; up = carriedUp(node)) {
    node = up;
  }
  return node;
}

// The call a value is an argument of, up through the literals, spreads, wrappers and branches that carry it there.
function carrierOf(start: Node): { readonly call: Invocation; readonly index: number } | null {
  const node = carriedTop(start);
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

// Whether a library declaration is a member of the platform's `Console`.
function* isConsoleMember(world: NativeWorld, handle: NodeHandle): APIRequestGenerator<boolean> {
  if (!(yield* isPlatform(world, handle))) {
    return false;
  }
  const declaration = yield* resolved(handle);
  return declaration !== undefined && declarationHome(declaration).container === CONSOLE;
}

// A callee or its receiver the checker resolves to a declaration in the observability home: the operator reads what it
// takes. A value merely built there decides nothing; only the target of its send does.
function* observedTarget(world: NativeWorld, call: Invocation): APIRequestGenerator<Destination | null> {
  const { name, receiver } = calleeOf(call);
  const receiverName = receiver !== null && isPropertyAccessExpression(receiver) ? receiver.name : receiver;
  const asked = [name, receiverName].filter((node): node is Node => node !== null && isIdentifier(node));
  const symbols = yield* all(...asked.map((node) => symbolOf(world, node)));
  const observed = symbols.some((symbol) => (symbol?.declarations ?? []).some((handle) => world.fileOf(handle)?.startsWith(OBSERVABILITY_HOME) === true));
  return observed ? { destination: "observability", receiver: call.expression.getText() } : null;
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
  // an arrow whose expression body is the parameter itself uses it there
  visit(body);
  return uses;
}

function* resolved(handle: NodeHandle): APIRequestGenerator<Node | undefined> {
  return yield* handle.resolve.gen();
}

// A construction or a Hono response whose destination its callee names, or null for any other call.
function* namedDestination(world: NativeWorld, call: Invocation): APIRequestGenerator<readonly Destination[] | null> {
  if (call.expression.getText() === "c.json") {
    return [{ destination: "http", receiver: null }];
  }
  if (isNewExpression(call) && (yield* constructsError(world, call))) {
    return [{ destination: "error", receiver: calleeOf(call).text }];
  }
  return null;
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

// A library callee: the platform console and a logging library log, the AI SDK makes provider requests, and any other
// library that reads keys is a dependency. The console takes `...data: unknown[]`, so it is asked before the identity slot.
function* libraryDestination(world: NativeWorld, call: Invocation, index: number, handle: NodeHandle): APIRequestGenerator<readonly Destination[]> {
  if (yield* isConsoleMember(world, handle)) {
    return [{ destination: "log", receiver: CONSOLE_RECEIVER }];
  }
  const pkg = packageOf(handle.path);
  if (pkg === null) {
    return wireCall(call);
  }
  if (isAiSdk(pkg)) {
    return [{ destination: "provider", receiver: pkg }];
  }
  if (pkg === COLUMN_PACKAGE || (yield* isOpaqueSlot(world, (call.arguments ?? [])[index]))) {
    return [];
  }
  return [{ destination: LOG_PACKAGES.has(pkg) ? "log" : "dependency", receiver: pkg }];
}

/** Where a chased value goes. `dropped`: it reached an in-tree body that only consumes it, on every path (the value is
 *  tested, voided or left as a bare statement), so nothing receives it. A value stored or bound by a `let` is not
 *  followed, which is no drop. `read`: some path reads every member of the value in the process, a compared
 *  serialization or a dotted-path read ({@link NESTED_READS}). */
export interface Chase {
  readonly to: readonly Destination[];
  readonly dropped: boolean;
  readonly read: boolean;
  /** Whether the depth bound stopped some path of the chase: that path is unclassified. */
  readonly stopped: boolean;
}

const sentTo = (to: readonly Destination[]): Chase => ({ to, dropped: false, read: false, stopped: false });
const READ_WHOLE: Chase = { to: [], dropped: false, read: true, stopped: false };
const STOPPED_CHASE: Chase = { to: [], dropped: false, read: false, stopped: true };

/** The count a graph build adds for each chase the depth bound stopped. */
export const CHASE_STOPPED = "send chases stopped by the depth bound";

// What a call does with a value its callee alone decides: a serialization's destination or whole read, a dotted-path
// reader's whole read of its first argument, a named construction or response; null for any other call.
function* namedChase(world: NativeWorld, call: Invocation, index: number, { depth }: Walk): APIRequestGenerator<Chase | null> {
  if (isSerialization(call)) {
    const serialized = yield* serializedBy(world, call, depth);
    return serialized.whole
      ? READ_WHOLE
      : { to: [{ destination: serialized.destination, receiver: null }], dropped: false, read: false, stopped: serialized.stopped };
  }
  const { text } = calleeOf(call);
  if (index === 0 && text !== null && NESTED_READS.has(text)) {
    return READ_WHOLE;
  }
  const named = yield* namedDestination(world, call);
  return named === null ? null : sentTo(named);
}

// The body an in-tree callee's declaration runs and the name of the parameter that takes argument `index` (a rest
// parameter takes the arguments past it); null when the declaration holds no body or the parameter is a pattern.
function* parameterOf(handle: NodeHandle, index: number): APIRequestGenerator<Taken | null> {
  const declaration = yield* resolved(handle);
  const fn = declaration === undefined ? null : functionOf(declaration);
  return fn === null ? null : parameterIn(fn, index);
}

interface Taken {
  readonly fn: FunctionLike;
  readonly body: Node;
  readonly name: string;
}

function parameterIn(fn: FunctionLike, index: number): Taken | null {
  const parameter = fn.parameters[index] ?? fn.parameters.at(-1);
  return fn.body !== undefined && parameter !== undefined && isParameterDeclaration(parameter) && isIdentifier(parameter.name)
    ? { fn, body: fn.body, name: parameter.name.text }
    : null;
}

// Where a value given to `call` at `index` goes: the observability home when the callee or its receiver is declared
// there, what its callee alone decides, a library, wherever the in-tree callee hands its parameter on, or what an
// in-tree port with no body of its own resolves to.
function* callDestinations(world: NativeWorld, call: Invocation, index: number, walk: Walk): APIRequestGenerator<Chase> {
  const observed = yield* observedTarget(world, call);
  if (observed !== null) {
    return sentTo([observed]);
  }
  const named = yield* namedChase(world, call, index, walk);
  if (named !== null) {
    return named;
  }
  const { name } = calleeOf(call);
  const declarations = (name === null ? undefined : yield* symbolOf(world, name))?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree === undefined && outside !== undefined) {
    return sentTo(yield* libraryDestination(world, call, index, outside));
  }
  const taken = inTree === undefined ? null : yield* parameterOf(inTree, index);
  if (taken !== null) {
    return walk.depth >= CHASE_DEPTH ? STOPPED_CHASE : yield* bodyChase(world, usesOf(taken.body, taken.name), entered(walk, { call, fn: taken.fn }));
  }
  const port = walk.depth >= CHASE_DEPTH ? null : yield* portChase(world, call, index, walk);
  return port ?? sentTo(wireCall(call));
}

// Where an in-tree body's uses of its parameter take the value: every destination any use reaches, a read where any
// use reads it whole, and a drop only where every use drops it.
// `walk` holds the call the body was entered through, one level deeper.
function* bodyChase(world: NativeWorld, uses: readonly Node[], walk: Walk): APIRequestGenerator<Chase> {
  return joined(yield* all(...uses.map((use) => destinationsOf(world, use, walk))));
}

function joined(chased: readonly Chase[]): Chase {
  const to = chased.flatMap((use) => use.to);
  const read = chased.some((use) => use.read);
  return { to, dropped: to.length === 0 && !read && chased.every((use) => use.dropped), read, stopped: chased.some((use) => use.stopped) };
}

// A use that ends the value where it stands: a test, a `void`, a `typeof` or a bare statement. Any other position the
// chase does not follow (a store, a `let`, a key's receiver) passes the value on unseen.
function consumedAt(value: Node): boolean {
  const node = carriedTop(value);
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

function* destinationsOf(world: NativeWorld, value: Node, walk: Walk): APIRequestGenerator<Chase> {
  const carrier = carrierOf(value);
  if (carrier !== null) {
    return yield* callDestinations(world, carrier.call, carrier.index, walk);
  }
  const node = carriedTop(value);
  const result = yield* listResult(world, node);
  if (result !== null) {
    return yield* destinationsOf(world, result, walk);
  }
  const fn = returningFunction(node);
  if (fn !== null) {
    return yield* returnedTo(world, fn, walk);
  }
  const { parent } = node;
  if (isVariableDeclaration(parent) && parent.initializer === node) {
    return yield* boundTo(world, parent, walk);
  }
  return { to: [], dropped: consumedAt(value), read: false, stopped: false };
}

/** Where a value handed on goes: the call it is an argument of, followed into an in-tree callee's body, the calls a
 *  function it is returned from hands its result to, and the reads of a `const` it initializes. */
export const sendChase = (world: NativeWorld, value: Node): APIRequestGenerator<Chase> => destinationsOf(world, value, { depth: 0, context: [] });

// --- Returns and bindings -----------------------------------------------------------------------------------
// The forward reading of the value trace's rules (graph/values.ts, list-methods.ts): a call a chase entered through a
// parameter is its context, and a value that reaches the return of that call's function goes on at that call alone. A
// return reached with no context goes on at every product call of its function; one in a function the context does not
// name is a closure's, handed to a call the chase never saw.

// A call a chase entered through a parameter, and the function whose body takes it.
interface Frame {
  readonly call: Invocation;
  readonly fn: FunctionLike;
}
// How deep a chase is, and the calls it entered through a parameter, innermost last.
interface Walk {
  readonly depth: number;
  readonly context: readonly Frame[];
}

const entered = ({ depth, context }: Walk, frame: Frame): Walk => ({ depth: depth + 1, context: [...context, frame] });
const deeper = ({ depth, context }: Walk): Walk => ({ depth: depth + 1, context });

const UNSEEN_CHASE: Chase = sentTo([{ destination: "unclassified", receiver: null }]);
const UNFOLLOWED_BINDING: Chase = { to: [], dropped: false, read: false, stopped: false };

// Whether every declaration a method name resolves to is the platform's, as `Array.prototype.map` is.
function* platformMethod(world: NativeWorld, name: Node): APIRequestGenerator<boolean> {
  const declarations = (yield* symbolOf(world, name))?.declarations ?? [];
  const platform = yield* all(...declarations.map((handle) => isPlatform(world, handle)));
  return platform.length > 0 && platform.every(Boolean);
}

// The call whose result holds a value that is the receiver of a platform list method returning the receiver's elements
// or one of them (RESULTS).
function* listResult(world: NativeWorld, node: Node): APIRequestGenerator<Invocation | null> {
  const access = node.parent;
  if (!(isPropertyAccessExpression(access) && access.expression === node && isCallExpression(access.parent) && access.parent.expression === access)) {
    return null;
  }
  const result = RESULTS.get(access.name.text);
  return (result === "same" || result === "element") && (yield* platformMethod(world, access.name)) ? access.parent : null;
}

// The function a value is returned from: a `return` outside nested functions, or an arrow's expression body.
function returningFunction(node: Node): FunctionLike | null {
  const { parent } = node;
  if (isArrowFunction(parent) && parent.body === node) {
    return parent;
  }
  if (!isReturnStatement(parent)) {
    return null;
  }
  for (let at: Node = parent.parent; !isSourceFile(at); at = at.parent) {
    if (isFunctionLike(at)) {
      return at;
    }
  }
  return null;
}

// The name a function is called by: its own, or the `const` or key that holds it.
function functionName(fn: FunctionLike): Node | null {
  if (isFunctionDeclaration(fn) || isMethodDeclaration(fn)) {
    return fn.name ?? null;
  }
  const { parent } = fn;
  return (isVariableDeclaration(parent) || isPropertyAssignment(parent)) && parent.initializer !== undefined && sameNode(parent.initializer, fn)
    ? parent.name
    : null;
}

// Where a returned value goes: a platform list method's result for a callback whose returns it maps (RESULTS), the
// context call for its function, a closure's unseen call, or each product call of the function.
function* returnedTo(world: NativeWorld, fn: FunctionLike, walk: Walk): APIRequestGenerator<Chase> {
  const method = methodCallOf(fn);
  const result = method === undefined || method.index !== 0 ? undefined : RESULTS.get(method.method);
  if (method !== undefined && (result === "mapped" || result === "flat") && isPropertyAccessExpression(method.call.expression)) {
    return (yield* platformMethod(world, method.call.expression.name)) ? yield* destinationsOf(world, method.call, walk) : UNSEEN_CHASE;
  }
  const frame = walk.context.at(-1);
  if (frame !== undefined) {
    return sameNode(frame.fn, fn) ? yield* destinationsOf(world, frame.call, { depth: walk.depth, context: walk.context.slice(0, -1) }) : UNSEEN_CHASE;
  }
  const name = functionName(fn);
  if (name === null) {
    return UNSEEN_CHASE;
  }
  if (walk.depth >= CHASE_DEPTH) {
    return STOPPED_CHASE;
  }
  const references = (yield* productReferences(world, name)).filter((reference) => !(sameNode(reference, name) || namesOnly(reference)));
  const calls = references.map(calledAt);
  // a function no product code calls returns to a caller the chase never sees
  if (calls.length === 0) {
    return UNSEEN_CHASE;
  }
  const chased = yield* all(...calls.flatMap((call) => (call === null ? [] : [destinationsOf(world, call, deeper(walk))])));
  return joined(calls.includes(null) ? [...chased, UNSEEN_CHASE] : chased);
}

// A reference that names a function without handing it anywhere: an import, an export or a `typeof` type.
const namesOnly = (reference: Node): boolean =>
  isImportSpecifier(reference.parent) || isImportClause(reference.parent) || isExportSpecifier(reference.parent) || isTypeQueryNode(reference.parent);

// The call a function reference is the callee of, `f(…)` or `x.f(…)`; null for a reference that hands the function on.
function calledAt(reference: Node): Invocation | null {
  const callee = isPropertyAccessExpression(reference.parent) && reference.parent.name === reference ? reference.parent : reference;
  const { parent } = callee;
  return (isCallExpression(parent) || isNewExpression(parent)) && parent.expression === callee ? parent : null;
}

// Where a value a `const` holds goes: each product read of the names it binds. A `let` may be reassigned, so its value
// is not followed.
function* boundTo(world: NativeWorld, declaration: VariableDeclaration, walk: Walk): APIRequestGenerator<Chase> {
  if (!(isVariableDeclarationList(declaration.parent) && hasFlag(declaration.parent.flags, NodeFlags.Const))) {
    return UNFOLLOWED_BINDING;
  }
  if (walk.depth >= CHASE_DEPTH) {
    return STOPPED_CHASE;
  }
  const names = boundNames(declaration.name);
  const references = (yield* all(...names.map((name) => productReferences(world, name)))).flat();
  const reads = references.filter((reference) => !names.some((name) => sameNode(name, reference)));
  // a binding no product code reads hands its value to a reader the chase never sees
  if (reads.length === 0) {
    return UNFOLLOWED_BINDING;
  }
  return joined(yield* all(...reads.map((read) => destinationsOf(world, read, deeper(walk)))));
}

// The identifiers a binding name declares, through nested object and array patterns.
function boundNames(name: Node): readonly Node[] {
  if (isIdentifier(name)) {
    return [name];
  }
  if (isObjectBindingPattern(name) || isArrayBindingPattern(name)) {
    return name.elements.flatMap((element) => (isBindingElement(element) && element.name !== undefined ? boundNames(element.name) : []));
  }
  return [];
}

// --- In-tree ports ------------------------------------------------------------------------------------------

/** What fills a port's interface whole: the logging libraries whose values do, and whether some fill is neither one
 *  nor the port handed on. */
interface PortFills {
  readonly logs: readonly string[];
  readonly unresolved: boolean;
}

const NO_FILLS: PortFills = { logs: [], unresolved: false };
const PORT_UNRESOLVED: Destination = { destination: "unclassified", receiver: null };
// One fill check per port interface and world: the answer is the program's, whichever call asks.
const portFillMemo = new WeakMap<NativeWorld, Map<string, PortFills>>();

/** A call through a member with no body of its own, an interface's or a type literal's: what takes the value is each
 *  function a product key-write gives the member, chased as a body, and each value that fills the port's interface
 *  whole. A logging library's value logs, the port handed on fills nothing new, and any other fill is unclassified.
 *  Null when the port resolves to nothing, as a member no product code fills. */
function* portChase(world: NativeWorld, call: Invocation, index: number, walk: Walk): APIRequestGenerator<Chase | null> {
  const { name, receiver } = calleeOf(call);
  const member = name === null ? undefined : yield* bodilessMember(world, name);
  const port = member?.parent ?? (receiver === null ? undefined : yield* receiverInterface(world, receiver));
  const written = member === undefined ? { functions: [], unresolved: false } : yield* keyWrites(world, member);
  const chases = yield* all(...written.functions.map((fn) => functionChase(world, { call, fn }, index, walk)));
  // An element-access call names no one member, so a literal's keys cannot say which function it reaches.
  const filled = port !== undefined && isInterfaceDeclaration(port) ? yield* portFills(world, port, member === undefined) : NO_FILLS;
  const to: Destination[] = [
    ...chases.flatMap((chase) => chase.to),
    ...filled.logs.map((pkg): Destination => ({ destination: "log", receiver: pkg })),
    ...(written.unresolved || filled.unresolved ? [PORT_UNRESOLVED] : []),
  ];
  const read = chases.some((chase) => chase.read);
  if (to.length === 0 && !read && chases.length === 0) {
    return null;
  }
  const dropped = to.length === 0 && !read && chases.every((chase) => chase.dropped);
  return { to, dropped, read, stopped: chases.some((chase) => chase.stopped) };
}

// The in-tree member a callee name resolves to, when it is a signature with no body: a port some value fills.
function* bodilessMember(world: NativeWorld, name: Node): APIRequestGenerator<Node | undefined> {
  const own = (yield* symbolOf(world, name))?.declarations.find((handle) => world.fileOf(handle) !== null);
  const declaration = own === undefined ? undefined : yield* resolved(own);
  return declaration !== undefined && (isPropertySignatureDeclaration(declaration) || isMethodSignatureDeclaration(declaration)) ? declaration : undefined;
}

// The in-tree interface a call's receiver is typed by, as `log[level](...)` calls through it.
function* receiverInterface(world: NativeWorld, receiver: Node): APIRequestGenerator<Node | undefined> {
  const symbol = yield* (yield* world.checker.getTypeAtLocation.gen(receiver)).getSymbol.gen();
  const own = symbol?.declarations.find((handle) => world.fileOf(handle) !== null);
  return own === undefined ? undefined : yield* resolved(own);
}

// The production references a find-references at `name` reports, resolved.
function* productReferences(world: NativeWorld, name: Node): APIRequestGenerator<readonly Node[]> {
  const groups = yield* world.referencedSymbolsOf(name);
  const handles = groups.flatMap((group) => group.references).filter((handle) => isProduction(world.fileOf(handle) ?? ""));
  const nodes = yield* all(...handles.map((handle) => resolved(handle)));
  return nodes.filter((node): node is Node => node !== undefined);
}

const sameNode = (a: Node, b: Node): boolean => a.pos === b.pos && a.end === b.end && a.getSourceFile().fileName === b.getSourceFile().fileName;

// The functions product key-writes give a member: `key: fn`, `key: (…) => …`, a shorthand `key` and a method. A write
// of any other value is unresolved.
function* keyWrites(
  world: NativeWorld,
  member: Node & { readonly name?: Node },
): APIRequestGenerator<{ readonly functions: readonly FunctionLike[]; readonly unresolved: boolean }> {
  if (member.name === undefined) {
    return { functions: [], unresolved: true };
  }
  const functions: FunctionLike[] = [];
  let unresolved = false;
  for (const reference of yield* productReferences(world, member.name)) {
    const { parent } = reference;
    const named = (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isMethodDeclaration(parent)) && sameNode(parent.name, reference);
    if (!named) {
      continue;
    }
    const fn = yield* writtenFunction(world, parent);
    if (fn === null) {
      unresolved = true;
    } else {
      functions.push(fn);
    }
  }
  return { functions, unresolved };
}

// The function a key-write gives its member: a method, an initializer, or the function a name or shorthand holds.
function* writtenFunction(world: NativeWorld, write: Node): APIRequestGenerator<FunctionLike | null> {
  if (isMethodDeclaration(write)) {
    return isFunctionLike(write) && write.body !== undefined ? write : null;
  }
  const direct = functionOf(write);
  if (direct !== null) {
    return direct;
  }
  let held: NativeSymbol | undefined;
  if (isShorthandPropertyAssignment(write)) {
    held = yield* world.checker.getShorthandAssignmentValueSymbol.gen(write);
  } else if (isPropertyAssignment(write) && isIdentifier(write.initializer)) {
    held = yield* symbolOf(world, write.initializer);
  }
  const handle = held?.valueDeclaration ?? held?.declarations[0];
  const declaration = handle === undefined || world.fileOf(handle) === null ? undefined : yield* resolved(handle);
  return declaration === undefined ? null : functionOf(declaration);
}

// Where a function a port's member holds takes the argument at `index`: a parameter it never declares drops the value.
function* functionChase(world: NativeWorld, frame: Frame, index: number, walk: Walk): APIRequestGenerator<Chase> {
  const { fn } = frame;
  const last = fn.parameters.at(-1);
  const rest = last !== undefined && isParameterDeclaration(last) && last.dotDotDotToken !== undefined;
  if (fn.parameters.length <= index && !rest) {
    return { to: [], dropped: true, read: false, stopped: false };
  }
  const taken = parameterIn(fn, index);
  return taken === null ? sentTo([PORT_UNRESOLVED]) : yield* bodyChase(world, usesOf(taken.body, taken.name), entered(walk, frame));
}

/** The values that fill an in-tree interface whole, found from each production place its name types: a member's
 *  key-writes, a parameter's arguments, a variable's initializer and a function's returns. A type position that hands
 *  the interface on (an alias, a heritage clause, a type argument) leaves the port unresolved; an indexed access or a
 *  `keyof` names members and fills nothing. With `literalsUnknown`, an object literal fill is unresolved too. */
function* portFills(world: NativeWorld, port: InterfaceDeclaration, literalsUnknown: boolean): APIRequestGenerator<PortFills> {
  const key = `${nodeKey(world, port)}:${String(literalsUnknown)}`;
  const memo = portFillMemo.get(world) ?? new Map<string, PortFills>();
  portFillMemo.set(world, memo);
  const known = memo.get(key);
  if (known !== undefined) {
    return known;
  }
  const values: Node[] = [];
  let unresolved = false;
  for (const reference of yield* productReferences(world, port.name)) {
    const placed = yield* typedPlaceValues(world, port, reference);
    if (placed === null) {
      unresolved = true;
    } else {
      values.push(...placed);
    }
  }
  const judged = yield* all(...values.map((value) => fillOf(world, port, value, literalsUnknown)));
  const logs = judged.flatMap((fill) => (fill === null || fill === PORT_HANDED_ON ? [] : [fill]));
  const fills: PortFills = { logs: [...new Set(logs)], unresolved: unresolved || judged.includes(null) };
  memo.set(key, fills);
  return fills;
}

const PORT_HANDED_ON = "";

// The values a reference to the port's name puts into it: none for an import, an export or the declaration itself,
// null where the reference hands the type on unseen.
function* typedPlaceValues(world: NativeWorld, port: InterfaceDeclaration, reference: Node): APIRequestGenerator<readonly Node[] | null> {
  const { parent } = reference;
  if (sameNode(reference, port.name) || isImportSpecifier(parent) || isExportSpecifier(parent)) {
    return [];
  }
  if (!isTypeReferenceNode(parent)) {
    return null;
  }
  let typed: Node = parent;
  while (isUnionTypeNode(typed.parent) || isParenthesizedTypeNode(typed.parent)) {
    typed = typed.parent;
  }
  return yield* holderValues(world, typed.parent, typed);
}

// The values the declaration a port's type node annotates takes: see typedPlaceValues.
function* holderValues(world: NativeWorld, holder: Node, typed: Node): APIRequestGenerator<readonly Node[] | null> {
  // an indexed access names one member and `keyof` names the keys: neither fills the port
  if (isIndexedAccessTypeNode(holder) || (isTypeOperatorNode(holder) && holder.operator === SyntaxKind.KeyOfKeyword)) {
    return [];
  }
  if (isPropertySignatureDeclaration(holder) && holder.type === typed) {
    return yield* memberWrites(world, holder.name);
  }
  if (isParameterDeclaration(holder) && holder.type === typed && isFunctionLike(holder.parent)) {
    return yield* argumentsOf(world, holder.parent, holder.parent.parameters.indexOf(holder));
  }
  if (isVariableDeclaration(holder) && holder.type === typed) {
    return holder.initializer === undefined ? [] : [holder.initializer];
  }
  // a type node a function holds that no parameter holds is its return type
  if (isFunctionLike(holder)) {
    return returnsOf(holder);
  }
  return null;
}

// The values product key-writes give a member: an initializer, or the name a shorthand reads.
function* memberWrites(world: NativeWorld, name: Node): APIRequestGenerator<readonly Node[]> {
  return (yield* productReferences(world, name)).flatMap((reference): readonly Node[] => {
    const { parent } = reference;
    if (isPropertyAssignment(parent) && sameNode(parent.name, reference)) {
      return [parent.initializer];
    }
    return isShorthandPropertyAssignment(parent) && sameNode(parent.name, reference) ? [parent.name] : [];
  });
}

// The arguments the product's calls hand a function at `index`; null when some reference passes the function on unseen.
function* argumentsOf(world: NativeWorld, fn: FunctionLike, index: number): APIRequestGenerator<readonly Node[] | null> {
  const target = (isArrowFunction(fn) || isFunctionExpression(fn)) && (isVariableDeclaration(fn.parent) || isPropertyAssignment(fn.parent)) ? fn.parent : fn;
  const found: Node[] = [];
  for (const usage of yield* world.signatureUsage(target)) {
    const handed = yield* usageArgument(world, usage, target, index);
    if (handed === null) {
      return null;
    }
    found.push(...handed);
  }
  return found;
}

// The argument one usage of a function hands it at `index`: none for its own declaration, a test's call or an omitted
// argument, null for a reference that passes the function on.
function* usageArgument(world: NativeWorld, usage: SignatureUsage, target: Node, index: number): APIRequestGenerator<readonly Node[] | null> {
  const name = yield* usage.name.resolve.gen();
  const call = usage.call === undefined ? undefined : yield* usage.call.resolve.gen();
  if (name === undefined || !isProduction(world.siteOf(name).file) || (call === undefined && sameNode(name.parent, target))) {
    return [];
  }
  if (call === undefined || !(isCallExpression(call) || isNewExpression(call))) {
    return null;
  }
  const argument = (call.arguments ?? [])[index];
  return argument === undefined ? [] : [argument];
}

// What one value filling a port is: a logging library's (its package), the port handed on, or null when it is
// anything else. An absent value fills nothing; an object literal is the port's own keys unless `literalsUnknown`.
function* fillOf(world: NativeWorld, port: InterfaceDeclaration, value: Node, literalsUnknown: boolean): APIRequestGenerator<string | null> {
  let at = value;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at) || isNonNullExpression(at)) {
    at = at.expression;
  }
  if (isObjectLiteralExpression(at)) {
    return literalsUnknown ? null : PORT_HANDED_ON;
  }
  const type = yield* world.checker.getTypeAtLocation.gen(at);
  const parts = type.isUnionType() || type.isIntersectionType() ? yield* type.getTypes.gen() : [type];
  const present = parts.filter((part) => !(hasFlag(part.flags, TypeFlags.Undefined) || hasFlag(part.flags, TypeFlags.Null)));
  const symbols = (yield* all(...present.map((part) => part.getSymbol.gen()))).filter((symbol) => symbol !== undefined);
  if (symbols.length === 0) {
    return present.length === 0 ? PORT_HANDED_ON : null;
  }
  return yield* declaredFill(
    world,
    port,
    symbols.flatMap((symbol) => symbol.declarations),
  );
}

// A fill by its type's declarations: the port's own is the port handed on, one logging library's all is a log line.
function* declaredFill(world: NativeWorld, port: InterfaceDeclaration, handles: readonly NodeHandle[]): APIRequestGenerator<string | null> {
  if (handles.some((handle) => world.fileOf(handle) !== null)) {
    const own = yield* all(...handles.map((handle) => resolved(handle)));
    return own.every((node) => node !== undefined && sameNode(node, port)) ? PORT_HANDED_ON : null;
  }
  const packages = new Set(handles.map((handle) => packageOf(handle.path) ?? ""));
  const [pkg = ""] = packages;
  return packages.size === 1 && LOG_PACKAGES.has(pkg) ? pkg : null;
}

// --- Serializations -----------------------------------------------------------------------------------------

/** What a serialization does with its value: consumed whole in the process, or sent to a destination. A chase the depth
 *  bound stopped is unclassified and says so. */
type Serialized =
  | { readonly whole: true; readonly stopped: false }
  | { readonly whole: false; readonly destination: SendDestination; readonly stopped: boolean };

const WHOLE: Serialized = { whole: true, stopped: false };
const sent = (destination: SendDestination): Serialized => ({ whole: false, destination, stopped: false });
const UNPLACED = sent("unclassified");
const STOPPED: Serialized = { whole: false, destination: "unclassified", stopped: true };

const SERIALIZE = "JSON.stringify";
const isSerialization = (call: Invocation): call is CallExpression => isCallExpression(call) && call.expression.getText() === SERIALIZE;

// Comparing or ordering two serializations reads every field of both.
const COMPARE_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanEqualsToken,
]);

// The standard library's collections by the methods whose first argument is a key: a serialization there is an
// identity key, so the value is read whole.
const MAP_KEYS: ReadonlySet<string> = new Set(["get", "set", "has", "delete"]);
const SET_KEYS: ReadonlySet<string> = new Set(["add", "has", "delete"]);
const KEYED_COLLECTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["Map", MAP_KEYS],
  ["ReadonlyMap", MAP_KEYS],
  ["WeakMap", MAP_KEYS],
  ["Set", SET_KEYS],
  ["ReadonlySet", SET_KEYS],
  ["WeakSet", SET_KEYS],
]);

/** The package of Node's own types, whose ambient modules declare Node's platform. */
export const NODE_TYPES = "@types/node";
// The platform's own declarations: the compiler's default library and Node's types, whose fetch is undici's.
const PLATFORM_PACKAGES: ReadonlySet<string> = new Set([NODE_TYPES, "undici-types"]);
const NODE_MODULE_PREFIX = "node:";
// The Node modules that consume a string's bytes: a hash or a signature reads all of it, a file write stores it.
const HASH_MODULES: ReadonlySet<string> = new Set(["crypto"]);
const FILE_MODULES: ReadonlySet<string> = new Set(["fs", "fs/promises"]);
const CONSOLE = "Console";
const PLATFORM_ERROR = "Error";
// The platform constructions a serialized string becomes the body of.
const PLATFORM_BODIES: ReadonlyMap<string, SendDestination> = new Map([
  ["Response", "http"],
  ["Blob", "file"],
]);
// A class's base chain is short; the bound only ends a walk the checker should never make cyclic.
const BASE_DEPTH = 8;
const SQL_TAG_PACKAGE = "drizzle-orm";

/** Where a library declaration sits: the class or interface that holds it (or is it), and the ambient module around
 *  it with `node:` dropped, so `node:crypto` and `crypto` are one module. */
export function declarationHome(node: Node): { readonly container: string | null; readonly module: string | null } {
  let container: string | null = null;
  let module: string | null = null;
  for (let at = node; module === null && !isSourceFile(at); at = at.parent) {
    if (container === null && (isClassDeclaration(at) || isInterfaceDeclaration(at))) {
      container = at.name?.text ?? null;
    }
    if (isModuleDeclaration(at) && isStringLiteral(at.name)) {
      module = at.name.text.startsWith(NODE_MODULE_PREFIX) ? at.name.text.slice(NODE_MODULE_PREFIX.length) : at.name.text;
    }
  }
  return { container, module };
}

// Whether a declaration is the platform's: the compiler's default library or Node's types.
function* isPlatform(world: NativeWorld, handle: NodeHandle): APIRequestGenerator<boolean> {
  if (yield* world.isDefaultLibrary(handle)) {
    return true;
  }
  const pkg = yield* world.packageOf(handle);
  return pkg !== null && PLATFORM_PACKAGES.has(pkg);
}

// The node a serialization's string reaches: through parentheses, assertions, template text, string concatenation and
// an array of parts, as `new Blob([JSON.stringify(value)])` takes them.
function consumerOf(start: Node): { readonly node: Node; readonly parent: Node } {
  let node = start;
  for (;;) {
    const { parent } = node;
    const concatenated = isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.PlusToken;
    if (
      isArrayLiteralExpression(parent) ||
      isParenthesizedExpression(parent) ||
      isAsExpression(parent) ||
      isNonNullExpression(parent) ||
      isTemplateSpan(parent) ||
      isTemplateExpression(parent) ||
      concatenated
    ) {
      node = parent;
      continue;
    }
    return { node, parent };
  }
}

// Every path's verdict as one: whole where any path reads the string, else the first placed destination, else
// unclassified, marked stopped where a stopped path left it so.
function joinedSerialized(paths: readonly Serialized[]): Serialized {
  if (paths.some((path) => path.whole)) {
    return WHOLE;
  }
  const placed = paths.find((path) => !path.whole && path.destination !== "unclassified");
  return placed ?? (paths.some((path) => path.stopped) ? STOPPED : UNPLACED);
}

/** What the `JSON.stringify` call `call` does with its value, read from every place its string goes. */
function* serializedBy(world: NativeWorld, call: CallExpression, depth: number): APIRequestGenerator<Serialized> {
  return yield* stringGoes(world, call, depth);
}

function* stringGoes(world: NativeWorld, start: Node, depth: number): APIRequestGenerator<Serialized> {
  const { node, parent } = consumerOf(start);
  if (isBinaryExpression(parent) && COMPARE_OPERATORS.has(parent.operatorToken.kind)) {
    return WHOLE;
  }
  if (isTaggedTemplateExpression(parent)) {
    return yield* taggedTakes(world, parent.tag);
  }
  if (isCallExpression(parent) && parent.expression !== node) {
    return yield* callTakes(world, parent, [...parent.arguments].indexOf(node as Expression), depth);
  }
  if (isNewExpression(parent)) {
    return yield* constructionTakes(world, parent);
  }
  if (isThrowStatement(parent)) {
    return sent("error");
  }
  if (isPropertyAssignment(parent) && parent.initializer === node && isObjectLiteralExpression(parent.parent)) {
    return yield* keyTakes(world, parent.parent, parent.name);
  }
  if (isVariableDeclaration(parent) && isIdentifier(parent.name)) {
    return yield* bindingTakes(world, parent.name, depth);
  }
  return UNPLACED;
}

// A tag the string is a substitution of: Drizzle's `sql` stores it as a SQL parameter, another library's tag takes it.
function* taggedTakes(world: NativeWorld, tag: Node): APIRequestGenerator<Serialized> {
  const symbol = yield* symbolOf(world, isPropertyAccessExpression(tag) ? tag.name : tag);
  const outside = symbol?.declarations.find((handle) => world.fileOf(handle) === null);
  const pkg = outside === undefined ? null : yield* world.packageOf(outside);
  if (pkg === SQL_TAG_PACKAGE) {
    return sent("stored");
  }
  return pkg === null ? UNPLACED : sent("dependency");
}

// A call the string is an argument of: an observability target observes it, an in-tree body is followed through its
// parameter, an in-tree port by what it resolves to, a platform declaration is judged by where it sits, and any other
// library takes the string, as a logger when its package is one.
function* callTakes(world: NativeWorld, call: CallExpression, index: number, depth: number): APIRequestGenerator<Serialized> {
  if ((yield* observedTarget(world, call)) !== null) {
    return sent("observability");
  }
  const { name } = calleeOf(call);
  const symbol = name === null ? undefined : yield* symbolOf(world, name);
  const declarations = symbol?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  if (inTree !== undefined) {
    const taken = yield* parameterOf(inTree, index);
    if (taken === null) {
      return yield* portTakes(world, call, index, depth);
    }
    if (depth >= CHASE_DEPTH) {
      return STOPPED;
    }
    return joinedSerialized(yield* all(...usesOf(taken.body, taken.name).map((use) => stringGoes(world, use, depth + 1))));
  }
  const [outside] = declarations;
  if (symbol === undefined || outside === undefined) {
    return UNPLACED;
  }
  if (yield* isPlatform(world, outside)) {
    return yield* platformTakes(symbol, outside, index);
  }
  const pkg = packageOf(outside.path);
  return sent(pkg !== null && LOG_PACKAGES.has(pkg) ? "log" : "dependency");
}

// A string handed to an in-tree port: the one destination every way the port resolves agrees on, else unclassified.
function* portTakes(world: NativeWorld, call: CallExpression, index: number, depth: number): APIRequestGenerator<Serialized> {
  const port = depth >= CHASE_DEPTH ? null : yield* portChase(world, call, index, { depth, context: [] });
  const [first, ...rest] = port?.to ?? [];
  return first === undefined || rest.some(({ destination }) => destination !== first.destination) ? UNPLACED : sent(first.destination);
}

function* platformTakes(symbol: NativeSymbol, handle: NodeHandle, index: number): APIRequestGenerator<Serialized> {
  const declaration = yield* resolved(handle);
  const { container, module } = declaration === undefined ? { container: null, module: null } : declarationHome(declaration);
  if (index === 0 && container !== null && KEYED_COLLECTIONS.get(container)?.has(symbol.name) === true) {
    return WHOLE;
  }
  if (module !== null && HASH_MODULES.has(module)) {
    return WHOLE;
  }
  if (container === CONSOLE) {
    return sent("log");
  }
  if (module !== null && FILE_MODULES.has(module)) {
    return sent("file");
  }
  return WIRE_CALLS.has(symbol.name) ? sent("wire") : UNPLACED;
}

// A construction the string is an argument of: a platform response or blob is its body, an error is its message.
function* constructionTakes(world: NativeWorld, construct: NewExpression): APIRequestGenerator<Serialized> {
  const symbol = yield* symbolOf(world, construct.expression);
  const [declaration] = symbol?.declarations ?? [];
  const body = symbol === undefined ? undefined : PLATFORM_BODIES.get(symbol.name);
  if (body !== undefined && declaration !== undefined && (yield* isPlatform(world, declaration))) {
    return sent(body);
  }
  return (yield* constructsError(world, construct)) ? sent("error") : UNPLACED;
}

// Whether a construction builds an error: its type, or a base of it, is the standard library's `Error`.
function* constructsError(world: NativeWorld, construct: NewExpression): APIRequestGenerator<boolean> {
  let level: readonly Type[] = [yield* world.checker.getTypeAtLocation.gen(construct)];
  for (let depth = 0; depth < BASE_DEPTH && level.length > 0; depth += 1) {
    const symbols = yield* all(...level.map((type) => type.getSymbol.gen()));
    const named = symbols.flatMap((symbol) => (symbol?.name === PLATFORM_ERROR ? symbol.declarations : []));
    const platform = yield* all(...named.map((handle) => world.isDefaultLibrary(handle)));
    if (platform.includes(true)) {
      return true;
    }
    const bases = yield* all(...level.flatMap((type) => (type.isClassOrInterface() ? [type.getBaseTypes.gen()] : [])));
    level = bases.flatMap((list) => list ?? []);
  }
  return false;
}

// A key of an object literal the string is the value of: a platform member (a fetch init's `body`) sends it, a
// library's member takes it, and a member of the tree's own keeps it out of sight.
function* keyTakes(world: NativeWorld, literal: Expression, key: Node): APIRequestGenerator<Serialized> {
  const contextual = yield* world.checker.getContextualType.gen(literal);
  if (contextual === undefined || !isPropertyName(key)) {
    return UNPLACED;
  }
  const members = yield* propertiesNamed(world.checker, contextual, key.text);
  const outside = members.flatMap((member) => member?.declarations ?? []).find((handle) => world.fileOf(handle) === null);
  if (outside === undefined) {
    return UNPLACED;
  }
  return (yield* isPlatform(world, outside)) ? sent("wire") : sent("dependency");
}

// A binding the string is held in: each use the checker finds in the binding's file is chased, so what the uses do
// decides, never the binding's name.
function* bindingTakes(world: NativeWorld, name: Identifier, depth: number): APIRequestGenerator<Serialized> {
  if (depth >= CHASE_DEPTH) {
    return STOPPED;
  }
  const symbol = yield* world.checker.getSymbolAtLocation.gen(name);
  if (symbol === undefined) {
    return UNPLACED;
  }
  const handles = yield* world.checker.getReferencesToSymbolInFile.gen(name.getSourceFile().fileName, symbol);
  const found = yield* all(...handles.map((handle) => resolved(handle)));
  const uses = found.filter((use): use is Node => use !== undefined && !(use.pos === name.pos && use.end === name.end));
  return joinedSerialized(yield* all(...uses.map((use) => stringGoes(world, use, depth + 1))));
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
