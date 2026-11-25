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
//
// Invariants:
// - The chase follows the data, not only its holder: a value carried into a literal under a key is tracked at that key
//   path, a member read of the holder takes the path's first step (a read of another key drops the value), and the
//   platform's `Object.entries`, `Object.values` and `Object.fromEntries`, a list method's callback and a binding
//   pattern move the path as the platform moves the data.
// - A message door's send is a crossing, decided where every door is paired (graph/message-doors.ts): the chase goes
//   on from the receiving listener's parameter at the path the sent value held the data.
// - The depth bound counts the hops that fan out: a return to every caller, a port's fills and writes, a door
//   crossing. A call into one callee, a `const` and a platform rebuild are one step each; a node the chase already
//   reached with the same path and call adds nothing, which ends a cycle.
import type {
  BindingElement,
  CallExpression,
  Expression,
  Identifier,
  InterfaceDeclaration,
  NewExpression,
  Node,
  VariableDeclaration,
} from "@typescript/native/ast";
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
  isComputedPropertyName,
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
  isNewExpression,
  isNonNullExpression,
  isNumericLiteral,
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
import { all, TypeFlags } from "@typescript/native/sync";
import type { SendDestination } from "./boundaries.ts";
import { NESTED_READS, OBSERVABILITY_HOME, PROVIDER_BODIES } from "./boundaries.ts";
import { DRIZZLE_PACKAGE } from "./drizzle-rows.ts";
import { answer } from "./graph/resolve.ts";
import { honoResponse } from "./graph/urls.ts";
import type { ListResult } from "./list-methods.ts";
import { ELEMENT_PARAMETERS, methodCallOf, RESULTS } from "./list-methods.ts";
import type { FunctionLike, NativeWorld, PlatformMember } from "./native.ts";
import {
  callsPlatform,
  constituents,
  declarationHome,
  hasFlag,
  isFunctionLike,
  isPlatform,
  isPropertyName,
  platformMember,
  propertiesNamed,
  resolvedSymbol,
} from "./native.ts";
import { isProduction } from "./worlds.ts";

// The fan-out hops a value passes before it leaves: a sink that wraps a logger that wraps pino.
const CHASE_DEPTH = 3;

/** Where a sent value goes: the destination's kind and the library, logger or call that takes it, when one is named. */
export interface Destination {
  readonly destination: SendDestination;
  readonly receiver: string | null;
}

// The logging libraries, by the package that declares the callee: a call into one is a log line.
const LOG_PACKAGES: ReadonlySet<string> = new Set(["pino"]);
const CONSOLE_RECEIVER = "console";
// The platform members that send their argument out of the process, by `Container.member` (a global by its name).
const WIRE_MEMBERS: ReadonlySet<string> = new Set([
  "fetch",
  "postMessage",
  "WebSocket.send",
  "XMLHttpRequest.send",
  "RTCDataChannel.send",
  "ReadableStreamDefaultController.enqueue",
  "Navigator.sendBeacon",
  "Worker.postMessage",
  "MessagePort.postMessage",
  "Window.postMessage",
  "BroadcastChannel.postMessage",
  "DedicatedWorkerGlobalScope.postMessage",
  "ChildProcess.send",
  "Process.send",
]);
// The AI SDK model calls that make a provider request; the rest of the SDK builds models or parses responses.
const REQUEST_METHODS: ReadonlySet<string> = new Set(["doStream", "doGenerate", "doEmbed"]);
const NODE_MODULES = "/node_modules/";
const TYPES_SCOPE = "@types/";
// The compiler's own lib files, which the native compiler ships under its platform package.
const COMPILER_PACKAGE = "typescript";
const COMPILER_SCOPE = "@typescript/";
const CONSOLE = "Console";
// The platform's serializer and the `Object` statics that rebuild a value, by the interface that declares them.
const JSON_INTERFACE = "JSON";
const STRINGIFY = "stringify";
const OBJECT_STATICS = "ObjectConstructor";
const ENTRIES = "entries";
const VALUES = "values";
const FROM_ENTRIES = "fromEntries";
// The platform's global request function and the member of its init that carries the body.
const FETCH = "fetch";
const INIT_BODY = "body";

const isAiSdk = (pkg: string): boolean => pkg === "ai" || pkg.startsWith("@ai-sdk/");

const memberLabel = ({ container, name }: PlatformMember): string => (container === null ? name : `${container}.${name}`);
const isWireMember = (member: PlatformMember): boolean => WIRE_MEMBERS.has(memberLabel(member));

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

// --- Key paths ----------------------------------------------------------------------------------------------

/** One step from a holder to the data a chase follows inside it: a named key, a tuple slot, any element of a list, or
 *  any member of an object a rebuild keyed by runtime strings. */
export type Step =
  | { readonly kind: "key"; readonly key: string }
  | { readonly kind: "index"; readonly index: number }
  | { readonly kind: "element" }
  | { readonly kind: "member" };
/** Where the data sits inside the node a chase stands on; empty when the node is the data. */
export type KeyPath = readonly Step[];

const ELEMENT: Step = { kind: "element" };
const MEMBER: Step = { kind: "member" };
const ENTRY_VALUE: Step = { kind: "index", index: 1 };
const ENTRY_KEY = 0;

function stepText(step: Step): string {
  switch (step.kind) {
    case "key":
      return `.${step.key}`;
    case "index":
      return `[${String(step.index)}]`;
    case "element":
      return "[]";
    case "member":
      return ".*";
  }
}

/** A key path as text, which keys a chase's visits and a door crossing's. */
export const pathText = (path: KeyPath): string => path.map(stepText).join("");

// Whether a read by `key` (a member name, a literal index, or null for a computed key) can reach the data a step names.
function readTakes(step: Step, key: string | number | null): boolean {
  if (key === null || step.kind === "member") {
    return true;
  }
  if (step.kind === "key") {
    return key === step.key;
  }
  return typeof key === "number" && (step.kind === "element" || key === step.index);
}

// A list's element: a path that starts in an element moves into it, and a holder's key is no element.
function elementPath(path: KeyPath): KeyPath | null {
  const [first, ...rest] = path;
  if (first === undefined) {
    return [];
  }
  return first.kind === "element" || first.kind === "index" ? rest : null;
}

// --- Message doors ------------------------------------------------------------------------------------------

type Invocation = CallExpression | NewExpression;

// The message doors a chase crosses, as graph/message-doors.ts reads them: whether a call is a door's send of its
// argument `index`. The receivers are paired only once every file is walked, so a crossing is settled there.
interface DoorSends {
  readonly sendOf: (call: Invocation, index: number) => APIRequestGenerator<boolean>;
}

/** The message doors once every file is walked: a crossing a chase reached goes on in each listener its send pairs
 *  with. */
export interface DoorCrossings extends DoorSends {
  readonly crossedTo: (crossing: Crossing) => APIRequestGenerator<Chase>;
}

// No door: a chase with no graph build behind it sends a door's value to the wire.
const NO_DOORS: DoorSends = { sendOf: () => answer(false) };

// The scope a serialization's port check runs in: no door, and a cost the serialization's own bound already caps.
const UNCOUNTED_SCOPE: ChaseScope = { doors: NO_DOORS, count: () => undefined };

/** A door send a chase reached: the call, the argument that holds the data and where inside it, and the chase's depth. */
export interface Crossing {
  readonly call: Invocation;
  readonly index: number;
  readonly path: KeyPath;
  readonly depth: number;
}

/** A listener a door delivers to: its function, the parameter that takes the message, and whether the parameter is a
 *  DOM event whose `data` is the message. */
export interface Listener {
  readonly fn: FunctionLike;
  readonly index: number;
  readonly event: boolean;
}

const EVENT_DATA = "data";

// --- Where a handed value goes ------------------------------------------------------------------------------

const isWrapper = (parent: Node, node: Node): boolean =>
  isSpreadElement(parent) ||
  isParenthesizedExpression(parent) ||
  isAsExpression(parent) ||
  isSatisfiesExpression(parent) ||
  isNonNullExpression(parent) ||
  isTypeAssertion(parent) ||
  isAwaitExpression(parent) ||
  (isConditionalExpression(parent) && parent.condition !== node) ||
  (isBinaryExpression(parent) && (parent.operatorToken.kind === SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === SyntaxKind.BarBarToken));

// The step a literal's key takes: a named key, or any member for a computed one.
const keyStep = (name: Node): Step => (isPropertyName(name) ? { kind: "key", key: name.text } : MEMBER);

// The expression that carries a value one step on, with the step the value takes inside it: the literal its key or
// spread sits in, the array that holds it at a slot, or a wrapper around it. A spread copies members or elements to the
// same level.
function carriedUp(node: Node): { readonly up: Node; readonly step: Step | null } | null {
  const { parent } = node;
  if (isObjectLiteralExpression(parent.parent)) {
    const step = literalStep(parent, node);
    if (step !== undefined) {
      return { up: parent.parent, step };
    }
  }
  if (isArrayLiteralExpression(parent)) {
    return { up: parent, step: isSpreadElement(node) ? null : slotStep(parent.elements, node) };
  }
  return isWrapper(parent, node) ? { up: parent, step: null } : null;
}

// The step a value takes into the object literal its member sits in: a key, any member for a computed key, none for a
// spread; undefined where the value is no member's value.
function literalStep(member: Node, node: Node): Step | null | undefined {
  if (isPropertyAssignment(member) && member.initializer === node) {
    return isComputedPropertyName(member.name) ? MEMBER : keyStep(member.name);
  }
  if (isShorthandPropertyAssignment(member)) {
    return keyStep(member.name);
  }
  return isSpreadAssignment(member) ? null : undefined;
}

// The slot an array literal holds a value at; after a spread the slots are ones the source cannot name.
function slotStep(elements: readonly Node[], node: Node): Step {
  const index = elements.indexOf(node);
  return index === -1 || elements.slice(0, index).some((element) => isSpreadElement(element)) ? ELEMENT : { kind: "index", index };
}

// The outermost literal, spread, wrapper or branch that carries a value, and the path to the data inside it.
function carriedTop(start: Node, path: KeyPath): { readonly node: Node; readonly path: KeyPath } {
  let node = start;
  let at = path;
  for (let up = carriedUp(node); up !== null; up = carriedUp(node)) {
    node = up.up;
    at = up.step === null ? at : [up.step, ...at];
  }
  return { node, path: at };
}

// The call a carried value is an argument of.
function argumentOf(node: Node): { readonly call: Invocation; readonly index: number } | null {
  const { parent } = node;
  if (!(isCallExpression(parent) || isNewExpression(parent)) || parent.expression === node) {
    return null;
  }
  const index = [...(parent.arguments ?? [])].indexOf(node as Expression);
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

// A callee or its receiver the checker resolves to a declaration in the observability home: the operator reads what it
// takes. A value merely built there decides nothing; only the target of its send does.
function* observedTarget(world: NativeWorld, call: Invocation): APIRequestGenerator<Destination | null> {
  const { name, receiver } = calleeOf(call);
  const receiverName = receiver !== null && isPropertyAccessExpression(receiver) ? receiver.name : receiver;
  const asked = [name, receiverName].filter((node): node is Node => node !== null && isIdentifier(node));
  const symbols = yield* all(...asked.map((node) => resolvedSymbol(world, node)));
  const observed = symbols.some((symbol) => (symbol?.declarations ?? []).some((handle) => world.fileOf(handle)?.startsWith(OBSERVABILITY_HOME) === true));
  return observed ? { destination: "observability", receiver: call.expression.getText() } : null;
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

// A construction or a framework response whose destination its callee declares, or null for any other call.
function* namedDestination(world: NativeWorld, call: Invocation): APIRequestGenerator<readonly Destination[] | null> {
  if (yield* honoResponse(world, call)) {
    return [{ destination: "http", receiver: null }];
  }
  if (isNewExpression(call) && (yield* constructsError(world, call))) {
    return [{ destination: "error", receiver: calleeOf(call).text }];
  }
  return null;
}

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

// A library callee: the platform console logs, a platform member that sends out of the process is the wire, a logging
// library logs, the AI SDK makes provider requests, and any other library that reads keys is a dependency. The console
// takes `...data: unknown[]`, so it is asked before the identity slot.
function* libraryDestination(
  world: NativeWorld,
  argument: Node | undefined,
  symbol: NativeSymbol,
  handle: NodeHandle,
): APIRequestGenerator<readonly Destination[]> {
  const platform = yield* platformMember(world, symbol);
  if (platform?.container === CONSOLE) {
    return [{ destination: "log", receiver: CONSOLE_RECEIVER }];
  }
  if (platform !== null && isWireMember(platform)) {
    return [{ destination: "wire", receiver: memberLabel(platform) }];
  }
  const pkg = packageOf(handle.path);
  if (pkg === null) {
    return [];
  }
  if (isAiSdk(pkg)) {
    return [{ destination: "provider", receiver: pkg }];
  }
  if (pkg === DRIZZLE_PACKAGE || (yield* isOpaqueSlot(world, argument))) {
    return [];
  }
  return [{ destination: LOG_PACKAGES.has(pkg) ? "log" : "dependency", receiver: pkg }];
}

/** Where a chased value goes. `dropped`: it reached an in-tree body that only consumes it, on every path (the value is
 *  tested, voided or left as a bare statement, or only another key of its holder is read), so nothing receives it. A
 *  value stored or bound by a `let` is not followed, which is no drop. `read`: some path reads every member of the value
 *  in the process, a compared serialization or a dotted-path read ({@link NESTED_READS}). `crossed`: the door sends it
 *  reached, settled where the doors are paired. */
export interface Chase {
  readonly to: readonly Destination[];
  readonly dropped: boolean;
  readonly read: boolean;
  /** Whether the depth bound stopped some path of the chase: that path is unclassified. */
  readonly stopped: boolean;
  readonly crossed: readonly Crossing[];
}

/** A chase that ends at `to`. */
export const sentChase = (to: readonly Destination[]): Chase => ({ to, dropped: false, read: false, stopped: false, crossed: [] });
const READ_WHOLE: Chase = { to: [], dropped: false, read: true, stopped: false, crossed: [] };
const STOPPED_CHASE: Chase = { to: [], dropped: false, read: false, stopped: true, crossed: [] };
const DROPPED: Chase = { to: [], dropped: true, read: false, stopped: false, crossed: [] };
const UNFOLLOWED: Chase = { to: [], dropped: false, read: false, stopped: false, crossed: [] };
// A node the chase already stands on with the same path and call: what it finds there is counted once.
const REVISITED = DROPPED;

/** The count a graph build adds for each chase the depth bound stopped. */
export const CHASE_STOPPED = "send chases stopped by the depth bound";

// Whether a call's callee is the in-tree dotted-path reader {@link NESTED_READS} names, by its declaration.
function* readsNested(world: NativeWorld, call: Invocation): APIRequestGenerator<boolean> {
  const { name } = calleeOf(call);
  const symbol = name === null ? undefined : yield* resolvedSymbol(world, name);
  return (symbol?.declarations ?? []).some((handle) => NESTED_READS.some((reader) => reader.name === symbol?.name && world.fileOf(handle) === reader.file));
}

// What a call does with a value its callee alone decides: a serialization's destination or whole read, a dotted-path
// reader's whole read of its first argument, a named construction or response; null for any other call.
function* namedChase(world: NativeWorld, call: Invocation, index: number): APIRequestGenerator<Chase | null> {
  if (isCallExpression(call) && (yield* callsPlatform(world, call.expression, JSON_INTERFACE, STRINGIFY))) {
    const serialized = yield* serializedBy(world, call, 0);
    return serialized.whole ? READ_WHOLE : { ...sentChase([{ destination: serialized.destination, receiver: null }]), stopped: serialized.stopped };
  }
  if (index === 0 && (yield* readsNested(world, call))) {
    return READ_WHOLE;
  }
  const named = yield* namedDestination(world, call);
  return named === null ? null : sentChase(named);
}

// The path the platform's `Object` statics move the data to: `entries` holds each member's value at slot 1 of an
// element, `values` at an element, and `fromEntries` keys each element's slot 1 by its slot 0, any member. A path into
// an entry's key leaves no data. Null for any other call.
function* rebuiltPath(world: NativeWorld, call: Invocation, index: number, path: KeyPath): APIRequestGenerator<KeyPath | "dropped" | null> {
  if (!isCallExpression(call) || index !== 0) {
    return null;
  }
  const target = isPropertyAccessExpression(call.expression) ? call.expression.name : null;
  const member = target === null ? null : yield* platformMember(world, yield* resolvedSymbol(world, target));
  if (member?.container !== OBJECT_STATICS) {
    return null;
  }
  const inMember = path.slice(1);
  if (member.name === ENTRIES) {
    return [ELEMENT, ENTRY_VALUE, ...inMember];
  }
  if (member.name === VALUES) {
    return [ELEMENT, ...inMember];
  }
  if (member.name !== FROM_ENTRIES) {
    return null;
  }
  const entry = elementPath(path);
  const [slot, ...rest] = entry ?? [];
  if (entry === null || (slot?.kind === "index" && slot.index === ENTRY_KEY)) {
    return "dropped";
  }
  return [MEMBER, ...(slot === undefined ? [] : rest)];
}

// The body an in-tree callee's declaration runs and the parameter that takes argument `index` (a rest parameter takes
// the arguments past it); null when the declaration holds no body.
function* parameterOf(handle: NodeHandle, index: number): APIRequestGenerator<Taken | null> {
  const declaration = yield* resolved(handle);
  const fn = declaration === undefined ? null : functionOf(declaration);
  return fn === null ? null : parameterIn(fn, index);
}

interface Taken {
  readonly fn: FunctionLike;
  readonly body: Node;
  /** The parameter's binding name: an identifier or a pattern. */
  readonly name: Node;
}

function parameterIn(fn: FunctionLike, index: number): Taken | null {
  const parameter = fn.parameters[index] ?? fn.parameters.at(-1);
  return fn.body !== undefined && parameter !== undefined && isParameterDeclaration(parameter) ? { fn, body: fn.body, name: parameter.name } : null;
}

/** A name a binding declares and where the data sits inside the value it binds. */
interface Bound {
  readonly name: Identifier;
  readonly path: KeyPath;
}

// The identifiers a binding name declares with the path each holds the data at, through nested object and array
// patterns: with a path, only the elements whose key or slot can hold the data, and a rest element, which keeps it.
function boundOn(name: Node, path: KeyPath): readonly Bound[] {
  if (isIdentifier(name)) {
    return [{ name, path }];
  }
  if (!(isObjectBindingPattern(name) || isArrayBindingPattern(name))) {
    return [];
  }
  const [step, ...rest] = path;
  return name.elements.flatMap((element, at): readonly Bound[] => {
    if (!isBindingElement(element) || element.name === undefined) {
      return [];
    }
    if (step === undefined || element.dotDotDotToken !== undefined) {
      return boundOn(element.name, path);
    }
    const key = isObjectBindingPattern(name) ? bindingKey(element) : at;
    return readTakes(step, key) ? boundOn(element.name, rest) : [];
  });
}

// The member an object pattern's element reads: its property name, or its own name for a shorthand.
function bindingKey(element: BindingElement): string | null {
  const key = element.propertyName ?? element.name;
  return key !== undefined && isPropertyName(key) ? key.text : null;
}

// Each use of a parameter's bindings in its body, with the path it holds the data at.
const parameterUses = (taken: Taken, path: KeyPath): readonly { readonly node: Node; readonly path: KeyPath }[] =>
  boundOn(taken.name, path).flatMap((bound) =>
    usesOf(taken.body, bound.name.text)
      .filter((use) => use !== bound.name)
      .map((node) => ({ node, path: bound.path })),
  );

// Where a value given to `call` at `index` goes: the observability home when the callee or its receiver is declared
// there, a door crossing, what its callee alone decides, a platform rebuild, a library, wherever the in-tree callee
// hands its parameter on, or what an in-tree port with no body of its own resolves to.
function* callDestinations(world: NativeWorld, call: Invocation, index: number, walk: Walk): APIRequestGenerator<Chase> {
  const decided = yield* decidedChase(world, call, index, walk);
  if (decided !== null) {
    return decided;
  }
  const { name } = calleeOf(call);
  const symbol = name === null ? undefined : yield* resolvedSymbol(world, name);
  const declarations = symbol?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree === undefined && outside !== undefined && symbol !== undefined) {
    return sentChase(yield* libraryDestination(world, (call.arguments ?? [])[index], symbol, outside));
  }
  const taken = inTree === undefined ? null : yield* parameterOf(inTree, index);
  if (taken !== null) {
    return yield* bodyChase(world, parameterUses(taken, walk.path), entered(walk, { call, fn: taken.fn }));
  }
  if (walk.depth >= CHASE_DEPTH) {
    return inTree === undefined && name !== null ? UNFOLLOWED : depthStopped(walk.run);
  }
  return (yield* portChase(world, call, index, walk)) ?? UNFOLLOWED;
}

// What a call does with a value before its callee's own body is asked: the observability home, a door crossing, what
// the callee alone decides, or a platform rebuild that moves the data's path; null for any other call.
function* decidedChase(world: NativeWorld, call: Invocation, index: number, walk: Walk): APIRequestGenerator<Chase | null> {
  const observed = yield* observedTarget(world, call);
  if (observed !== null) {
    return sentChase([observed]);
  }
  if (yield* walk.run.doors.sendOf(call, index)) {
    walk.run.count(CHASE_COUNTS.crossings);
    return { ...UNFOLLOWED, crossed: [{ call, index, path: walk.path, depth: walk.depth }] };
  }
  const named = yield* namedChase(world, call, index);
  if (named !== null) {
    return named;
  }
  const rebuilt = yield* rebuiltPath(world, call, index, walk.path);
  if (rebuilt === null) {
    return null;
  }
  return rebuilt === "dropped" ? DROPPED : yield* destinationsOf(world, call, { ...walk, path: rebuilt });
}

// Where an in-tree body's uses of its parameter take the value: every destination any use reaches, a read where any
// use reads it whole, and a drop only where every use drops it.
function* bodyChase(world: NativeWorld, uses: readonly { readonly node: Node; readonly path: KeyPath }[], walk: Walk): APIRequestGenerator<Chase> {
  return joinChases(yield* all(...uses.map((use) => destinationsOf(world, use.node, { ...walk, path: use.path }))));
}

/** Every path's chase as one: each destination and crossing any path reaches, a read where any reads, a drop only where
 *  every path drops. */
export function joinChases(chased: readonly Chase[]): Chase {
  const to = chased.flatMap((use) => use.to);
  const read = chased.some((use) => use.read);
  const crossed = chased.flatMap((use) => use.crossed);
  return {
    to,
    dropped: to.length === 0 && crossed.length === 0 && !read && chased.every((use) => use.dropped),
    read,
    stopped: chased.some((use) => use.stopped),
    crossed,
  };
}

// A use that ends the value where it stands: a test, a `void`, a `typeof` or a bare statement. Any other position the
// chase does not follow (a store, a `let`, a key's receiver) passes the value on unseen.
function consumedAt(node: Node): boolean {
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

// A chase's identity at a node: the node, the path inside it and the call it entered through.
const visitKey = (world: NativeWorld, node: Node, walk: Walk): string => {
  const frame = walk.context.at(-1);
  return `${nodeKey(world, node)}${pathText(walk.path)}@${frame === undefined ? "" : nodeKey(world, frame.call)}`;
};

function* destinationsOf(world: NativeWorld, value: Node, walk: Walk): APIRequestGenerator<Chase> {
  const key = visitKey(world, value, walk);
  const { run } = walk;
  if (run.seen.has(key)) {
    return REVISITED;
  }
  if (run.hops >= HOP_BUDGET) {
    // one count per chase: every path past the budget stops on the same hop
    if (run.hops === HOP_BUDGET) {
      run.count(CHASE_COUNTS.budget);
      run.hops += 1;
    }
    return STOPPED_CHASE;
  }
  run.hops += 1;
  run.count(CHASE_COUNTS.hops);
  run.seen.add(key);
  const top = carriedTop(value, walk.path);
  const at: Walk = { ...walk, path: top.path };
  const argument = argumentOf(top.node);
  if (argument !== null) {
    return yield* callDestinations(world, argument.call, argument.index, at);
  }
  const read = yield* memberRead(world, top.node, at);
  if (read !== null) {
    return read;
  }
  const fn = returningFunction(top.node);
  if (fn !== null) {
    return yield* returnedTo(world, fn, at);
  }
  const { parent } = top.node;
  if (isVariableDeclaration(parent) && parent.initializer === top.node) {
    return yield* boundTo(world, parent, at);
  }
  return consumedAt(top.node) ? DROPPED : UNFOLLOWED;
}

// The key a read off a holder names: a member's name, a literal element key, or null for a computed one.
function readKey(access: Node): string | number | null {
  if (isPropertyAccessExpression(access)) {
    return access.name.text;
  }
  if (!isElementAccessExpression(access)) {
    return null;
  }
  const { argumentExpression } = access;
  if (isNumericLiteral(argumentExpression)) {
    return Number(argumentExpression.text);
  }
  return isStringLiteral(argumentExpression) ? argumentExpression.text : null;
}

// A read off the holder a chase stands on: a platform list method takes its elements, and a member read takes the
// path's first step, where a read of another key drops the data. Null where the node is no read's receiver, or the
// node is the data itself and the read is of its own member, which the chase does not follow.
function* memberRead(world: NativeWorld, node: Node, walk: Walk): APIRequestGenerator<Chase | null> {
  const access = node.parent;
  if (!((isPropertyAccessExpression(access) || isElementAccessExpression(access)) && access.expression === node)) {
    return null;
  }
  const call = access.parent;
  if (isPropertyAccessExpression(access) && isCallExpression(call) && call.expression === access && (yield* platformMethod(world, access.name))) {
    return yield* listMethodChase(world, call, access.name.text, walk);
  }
  const [step, ...rest] = walk.path;
  if (step === undefined) {
    return null;
  }
  return readTakes(step, readKey(access)) ? yield* destinationsOf(world, access, { ...walk, path: rest }) : DROPPED;
}

// A platform list method called on the holder: its callback's element parameters take the elements, and a result that
// is the list or one of its elements goes on (RESULTS). A callback's returns go where list-methods.ts maps them.
function* listMethodChase(world: NativeWorld, call: CallExpression, method: string, walk: Walk): APIRequestGenerator<Chase> {
  const element = elementPath(walk.path);
  const [callback] = call.arguments;
  const fn = callback === undefined ? null : yield* callbackOf(world, callback);
  const taken = fn === null || element === null ? [] : (ELEMENT_PARAMETERS.get(method) ?? []).flatMap((at) => parameterIn(fn, at) ?? []);
  const chases = yield* all(...taken.map((parameter) => bodyChase(world, parameterUses(parameter, element ?? []), walk)));
  const resultPath = listCarries(RESULTS.get(method), walk.path, element);
  const carried = resultPath === null ? [] : [yield* destinationsOf(world, call, { ...walk, path: resultPath })];
  return joinChases([...chases, ...carried]);
}

// The path a list method's own result holds the data at: the list's for a copy, the element's for a pick, none else.
function listCarries(result: ListResult | undefined, path: KeyPath, element: KeyPath | null): KeyPath | null {
  if (result === "same") {
    return path;
  }
  return result === "element" ? element : null;
}

// The function a list method's callback argument is: inline, or one of ours a name holds.
function* callbackOf(world: NativeWorld, callback: Node): APIRequestGenerator<FunctionLike | null> {
  if (isFunctionLike(callback)) {
    return callback.body === undefined ? null : callback;
  }
  if (!isIdentifier(callback)) {
    return null;
  }
  const own = (yield* resolvedSymbol(world, callback))?.declarations.find((handle) => world.fileOf(handle) !== null);
  const declaration = own === undefined ? undefined : yield* resolved(own);
  return declaration === undefined ? null : functionOf(declaration);
}

// Where a chase reports its cost: a counter's name and the amount, as a graph build's counts take them.
type ChaseCount = (name: string, by?: number) => void;

/** What a chase runs with: the message doors it crosses (as crossings) and where it counts its cost. */
export interface ChaseScope {
  readonly doors: DoorSends;
  readonly count: ChaseCount;
}

// The counters the send chases add to a build's counts.
const CHASE_COUNTS = {
  chases: "send chases",
  hops: "send chase hops",
  budget: "send chases stopped by the hop budget",
  depth: "send chase paths stopped by the depth bound",
  crossings: "send chase door crossings",
} as const;

// The nodes one chase may stand on before it stops: the depth bound counts only fan-out, so a long chain of single
// calls is bounded here. A chase past the budget is unclassified.
const HOP_BUDGET = 400;

const newRun = ({ doors, count }: ChaseScope): Run => ({ doors, seen: new Set(), count, hops: 0 });

function depthStopped(run: Run): Chase {
  run.count(CHASE_COUNTS.depth);
  return STOPPED_CHASE;
}

/** Where a value handed on goes: the call it is an argument of, followed into an in-tree callee's body, the calls a
 *  function it is returned from hands its result to, and the reads of a `const` it initializes. A message door's send
 *  comes back as a crossing. */
export function sendChase(world: NativeWorld, value: Node, scope: ChaseScope): APIRequestGenerator<Chase> {
  scope.count(CHASE_COUNTS.chases);
  return destinationsOf(world, value, { depth: 0, context: [], path: [], run: newRun(scope) });
}

/** Where a message a door delivers goes: the uses of the listener's parameter, through a DOM event's `data`, chased from
 *  the path the sent value held the data at. One crossing deeper than the chase that reached the send. */
export function* receivedChase(world: NativeWorld, listener: Listener, crossing: Crossing, scope: ChaseScope): APIRequestGenerator<Chase> {
  const run = newRun(scope);
  if (crossing.depth >= CHASE_DEPTH) {
    return depthStopped(run);
  }
  const taken = parameterIn(listener.fn, listener.index);
  if (taken === null) {
    return UNSEEN_CHASE;
  }
  const path: KeyPath = listener.event ? [{ kind: "key", key: EVENT_DATA }, ...crossing.path] : crossing.path;
  return yield* bodyChase(world, parameterUses(taken, path), { depth: crossing.depth + 1, context: [], path, run });
}

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
// What one chase shares across its paths: the door reader, the nodes it has reached, where it counts its cost, and the
// hops it has taken against the budget.
interface Run {
  readonly doors: DoorSends;
  readonly seen: Set<string>;
  readonly count: ChaseCount;
  hops: number;
}
// How many fan-out hops deep a chase is, the calls it entered through a parameter (innermost last), and the path to the
// data inside the node it stands on.
interface Walk {
  readonly depth: number;
  readonly context: readonly Frame[];
  readonly path: KeyPath;
  readonly run: Run;
}

const entered = (walk: Walk, frame: Frame): Walk => ({ ...walk, context: [...walk.context, frame] });
const fanned = (walk: Walk): Walk => ({ ...walk, depth: walk.depth + 1 });

const UNSEEN_CHASE: Chase = sentChase([{ destination: "unclassified", receiver: null }]);

// The platform list methods whose callback's return the platform only tests or orders: nothing receives it.
const TESTED_RETURNS: ReadonlySet<string> = new Set([
  "filter",
  "find",
  "findLast",
  "findIndex",
  "findLastIndex",
  "some",
  "every",
  "sort",
  "toSorted",
  "forEach",
]);

// Whether every declaration a method name resolves to is the platform's, as `Array.prototype.map` is.
function* platformMethod(world: NativeWorld, name: Node): APIRequestGenerator<boolean> {
  const declarations = (yield* resolvedSymbol(world, name))?.declarations ?? [];
  const platform = yield* all(...declarations.map((handle) => isPlatform(world, handle)));
  return platform.length > 0 && platform.every(Boolean);
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

// The path a list method's result holds a callback's returned data at: a mapped return is an element, and a flattened
// one loses its own slot.
function listResultPath(result: "mapped" | "flat", path: KeyPath): KeyPath {
  return result === "flat" ? [ELEMENT, ...(elementPath(path) ?? path)] : [ELEMENT, ...path];
}

// Where a returned value goes: a platform list method's result for a callback whose returns it maps (RESULTS), nothing
// for a callback the platform only tests, the context call for its function, a closure's unseen call, or each product
// call of the function.
function* returnedTo(world: NativeWorld, fn: FunctionLike, walk: Walk): APIRequestGenerator<Chase> {
  const listed = yield* callbackReturn(world, fn, walk);
  if (listed !== null) {
    return listed;
  }
  const frame = walk.context.at(-1);
  if (frame !== undefined) {
    return sameNode(frame.fn, fn) ? yield* destinationsOf(world, frame.call, { ...walk, context: walk.context.slice(0, -1) }) : UNSEEN_CHASE;
  }
  const name = functionName(fn);
  if (name === null) {
    return UNSEEN_CHASE;
  }
  if (walk.depth >= CHASE_DEPTH) {
    return depthStopped(walk.run);
  }
  const references = (yield* productReferences(world, name)).filter((reference) => !(sameNode(reference, name) || namesOnly(reference)));
  const calls = references.map(calledAt);
  // a function no product code calls returns to a caller the chase never sees
  if (calls.length === 0) {
    return UNSEEN_CHASE;
  }
  const chased = yield* all(...calls.flatMap((call) => (call === null ? [] : [destinationsOf(world, call, fanned(walk))])));
  return joinChases(calls.includes(null) ? [...chased, UNSEEN_CHASE] : chased);
}

// Where a platform list method's callback's return goes: its result for a method that maps the returns, nothing for one
// that only tests them; null for any other function.
function* callbackReturn(world: NativeWorld, fn: FunctionLike, walk: Walk): APIRequestGenerator<Chase | null> {
  const method = methodCallOf(fn);
  if (method === undefined || !isPropertyAccessExpression(method.call.expression) || !(yield* platformMethod(world, method.call.expression.name))) {
    return null;
  }
  const result = method.index === 0 ? RESULTS.get(method.method) : undefined;
  if (result === "mapped" || result === "flat") {
    return yield* destinationsOf(world, method.call, { ...walk, path: listResultPath(result, walk.path) });
  }
  return TESTED_RETURNS.has(method.method) ? DROPPED : null;
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

// Where a value a `const` holds goes: each product read of the names it binds, a pattern's names by the path each
// holds the data at. A `let` may be reassigned, so its value is not followed.
function* boundTo(world: NativeWorld, declaration: VariableDeclaration, walk: Walk): APIRequestGenerator<Chase> {
  if (!(isVariableDeclarationList(declaration.parent) && hasFlag(declaration.parent.flags, NodeFlags.Const))) {
    return UNFOLLOWED;
  }
  const bound = boundOn(declaration.name, walk.path);
  if (bound.length === 0) {
    return DROPPED;
  }
  const references = yield* all(...bound.map(({ name }) => productReferences(world, name)));
  const reads = bound.flatMap(({ name, path }, at) => (references[at] ?? []).filter((reference) => !sameNode(name, reference)).map((node) => ({ node, path })));
  // a binding no product code reads hands its value to a reader the chase never sees
  if (reads.length === 0) {
    return UNFOLLOWED;
  }
  return yield* bodyChase(world, reads, walk);
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
 *  whole. An element-access call (`log[level](…)`) names no one member, so every named member of the port's interface
 *  takes the value. A logging library's value logs, the port handed on fills nothing new, and any other fill is
 *  unclassified. Null when the port resolves to nothing, as a member no product code fills. */
function* portChase(world: NativeWorld, call: Invocation, index: number, walk: Walk): APIRequestGenerator<Chase | null> {
  const { name, receiver } = calleeOf(call);
  const member = name === null ? undefined : yield* bodilessMember(world, name);
  const port = member?.parent ?? (receiver === null ? undefined : yield* receiverInterface(world, receiver));
  const members = member === undefined ? interfaceMembers(port) : [member];
  const writes = yield* all(...members.map((each) => keyWrites(world, each)));
  const functions = writes.flatMap((written) => written.functions);
  const chases = yield* all(...functions.map((fn) => functionChase(world, { call, fn }, index, fanned(walk))));
  const filled = port !== undefined && isInterfaceDeclaration(port) ? yield* portFills(world, port) : NO_FILLS;
  const to: Destination[] = [
    ...chases.flatMap((chase) => chase.to),
    ...filled.logs.map((pkg): Destination => ({ destination: "log", receiver: pkg })),
    ...(writes.some((written) => written.unresolved) || filled.unresolved ? [PORT_UNRESOLVED] : []),
  ];
  const read = chases.some((chase) => chase.read);
  const crossed = chases.flatMap((chase) => chase.crossed);
  if (to.length === 0 && !read && chases.length === 0) {
    return null;
  }
  const dropped = to.length === 0 && crossed.length === 0 && !read && chases.every((chase) => chase.dropped);
  return { to, dropped, read, stopped: chases.some((chase) => chase.stopped), crossed };
}

const isNamedSignature = (node: Node): node is Node & { readonly name: Node } => isPropertySignatureDeclaration(node) || isMethodSignatureDeclaration(node);

const interfaceMembers = (port: Node | undefined): readonly Node[] =>
  port !== undefined && isInterfaceDeclaration(port) ? port.members.filter(isNamedSignature) : [];

// The in-tree member a callee name resolves to, when it is a signature with no body: a port some value fills.
function* bodilessMember(world: NativeWorld, name: Node): APIRequestGenerator<Node | undefined> {
  const own = (yield* resolvedSymbol(world, name))?.declarations.find((handle) => world.fileOf(handle) !== null);
  const declaration = own === undefined ? undefined : yield* resolved(own);
  return declaration !== undefined && isNamedSignature(declaration) ? declaration : undefined;
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

// The functions product key-writes give a member: `key: fn`, `key: (…) => …`, a shorthand `key`, a method, and the
// closures a factory call returns (`key: logAt("info")`). A write of any other value is unresolved.
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
    const written = yield* writtenFunctions(world, parent);
    if (written === null) {
      unresolved = true;
    } else {
      functions.push(...written);
    }
  }
  return { functions, unresolved };
}

// The functions a key-write gives its member: a method, an initializer, the function a name or shorthand holds, or
// the closures an in-tree factory the initializer calls returns.
function* writtenFunctions(world: NativeWorld, write: Node): APIRequestGenerator<readonly FunctionLike[] | null> {
  if (isMethodDeclaration(write)) {
    return isFunctionLike(write) && write.body !== undefined ? [write] : null;
  }
  const direct = functionOf(write);
  if (direct !== null) {
    return [direct];
  }
  const initializer = isPropertyAssignment(write) ? unwrapped(write.initializer) : undefined;
  if (initializer !== undefined && isCallExpression(initializer)) {
    return yield* factoryClosures(world, initializer);
  }
  const held = yield* heldSymbol(world, write, initializer);
  const handle = held?.valueDeclaration ?? held?.declarations[0];
  const declaration = handle === undefined || world.fileOf(handle) === null ? undefined : yield* resolved(handle);
  const fn = declaration === undefined ? null : functionOf(declaration);
  return fn === null ? null : [fn];
}

// The symbol a key-write's value names: a shorthand's value binding or an initializer's name.
function* heldSymbol(world: NativeWorld, write: Node, initializer: Node | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  if (isShorthandPropertyAssignment(write)) {
    return yield* world.checker.getShorthandAssignmentValueSymbol.gen(write);
  }
  return initializer !== undefined && isIdentifier(initializer) ? yield* resolvedSymbol(world, initializer) : undefined;
}

// The closures an in-tree function a call names returns; null when it returns anything else.
function* factoryClosures(world: NativeWorld, call: CallExpression): APIRequestGenerator<readonly FunctionLike[] | null> {
  const { name } = calleeOf(call);
  const own = name === null ? undefined : (yield* resolvedSymbol(world, name))?.declarations.find((handle) => world.fileOf(handle) !== null);
  const declaration = own === undefined ? undefined : yield* resolved(own);
  const factory = declaration === undefined ? null : functionOf(declaration);
  const returned = factory === null ? [] : returnsOf(factory).map(unwrapped);
  return returned.length > 0 && returned.every(isFunctionLike) ? returned.filter(isFunctionLike) : null;
}

function unwrapped(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at) || isNonNullExpression(at)) {
    at = at.expression;
  }
  return at;
}

// Where a function a port's member holds takes the argument at `index`: a parameter it never declares drops the value.
function* functionChase(world: NativeWorld, frame: Frame, index: number, walk: Walk): APIRequestGenerator<Chase> {
  const { fn } = frame;
  const last = fn.parameters.at(-1);
  const rest = last !== undefined && isParameterDeclaration(last) && last.dotDotDotToken !== undefined;
  if (fn.parameters.length <= index && !rest) {
    return DROPPED;
  }
  const taken = parameterIn(fn, index);
  return taken === null ? sentChase([PORT_UNRESOLVED]) : yield* bodyChase(world, parameterUses(taken, walk.path), entered(walk, frame));
}

/** The values that fill an in-tree interface whole, found from each production place its name types: a member's
 *  key-writes, a parameter's arguments, a variable's initializer and a function's returns. A type position that hands
 *  the interface on (an alias, a heritage clause, a type argument) leaves the port unresolved; an indexed access or a
 *  `keyof` names members and fills nothing. An object literal fill is the port's own keys, whose writes the chase
 *  follows. */
function* portFills(world: NativeWorld, port: InterfaceDeclaration): APIRequestGenerator<PortFills> {
  const key = nodeKey(world, port);
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
  const judged = yield* all(...values.map((value) => fillOf(world, port, value)));
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
// anything else. An absent value fills nothing; an object literal is the port's own keys.
function* fillOf(world: NativeWorld, port: InterfaceDeclaration, value: Node): APIRequestGenerator<string | null> {
  const at = unwrapped(value);
  if (isObjectLiteralExpression(at)) {
    return PORT_HANDED_ON;
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

// The Node modules that consume a string's bytes: a hash or a signature reads all of it, a file write stores it.
const HASH_MODULES: ReadonlySet<string> = new Set(["crypto"]);
const FILE_MODULES: ReadonlySet<string> = new Set(["fs", "fs/promises"]);
const PLATFORM_ERROR = "Error";
// The platform constructions a serialized string becomes the body of.
const PLATFORM_BODIES: ReadonlyMap<string, SendDestination> = new Map([
  ["Response", "http"],
  ["Blob", "file"],
]);
// A class's base chain is short; the bound only ends a walk the checker should never make cyclic.
const BASE_DEPTH = 8;

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
  const symbol = yield* resolvedSymbol(world, isPropertyAccessExpression(tag) ? tag.name : tag);
  const outside = symbol?.declarations.find((handle) => world.fileOf(handle) === null);
  const pkg = outside === undefined ? null : yield* world.packageOf(outside);
  if (pkg === DRIZZLE_PACKAGE) {
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
  const symbol = name === null ? undefined : yield* resolvedSymbol(world, name);
  const declarations = symbol?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  if (inTree !== undefined) {
    const taken = yield* parameterOf(inTree, index);
    if (taken === null || !isIdentifier(taken.name)) {
      return yield* portTakes(world, call, index, depth);
    }
    if (depth >= CHASE_DEPTH) {
      return STOPPED;
    }
    const parameter = taken.name.text;
    return joinedSerialized(yield* all(...usesOf(taken.body, parameter).map((use) => stringGoes(world, use, depth + 1))));
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
  const port = depth >= CHASE_DEPTH ? null : yield* portChase(world, call, index, { depth, context: [], path: [], run: newRun(UNCOUNTED_SCOPE) });
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
  return isWireMember({ name: symbol.name, container, module }) ? sent("wire") : UNPLACED;
}

// A construction the string is an argument of: a platform response or blob is its body, an error is its message.
function* constructionTakes(world: NativeWorld, construct: NewExpression): APIRequestGenerator<Serialized> {
  const symbol = yield* resolvedSymbol(world, construct.expression);
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
  /** The callee's resolved name, and the platform member it is when it is one. */
  readonly name: string | null;
  readonly platform: PlatformMember | null;
}

function* calleeAt(world: NativeWorld, call: Invocation): APIRequestGenerator<Callee> {
  const { name } = calleeOf(call);
  const symbol = name === null ? undefined : yield* resolvedSymbol(world, name);
  const declarations = symbol?.declarations ?? [];
  const inTree = declarations.find((handle) => world.fileOf(handle) !== null);
  const outside = declarations.find((handle) => world.fileOf(handle) === null);
  if (inTree !== undefined) {
    return { pkg: null, declaration: yield* resolved(inTree), name: symbol?.name ?? null, platform: null };
  }
  return {
    pkg: outside === undefined ? null : packageOf(outside.path),
    declaration: undefined,
    name: symbol?.name ?? null,
    platform: yield* platformMember(world, symbol),
  };
}

// The request carriers a call holds: an AI SDK model request's arguments and the platform `fetch` call's body.
function seedsOf(call: Invocation, { pkg, name, platform }: Callee): readonly Node[] {
  if (pkg !== null && isAiSdk(pkg) && name !== null && REQUEST_METHODS.has(name)) {
    return [...(call.arguments ?? [])];
  }
  const [, init] = call.arguments ?? [];
  if (!(platform?.container === null && platform.name === FETCH) || init === undefined) {
    return [];
  }
  const body = isObjectLiteralExpression(init)
    ? init.properties.find((property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === INIT_BODY)
    : undefined;
  return [body !== undefined && isPropertyAssignment(body) ? body.initializer : init];
}

// The platform's Fetch `Response`: a backend function that takes one reads what a provider sent back.
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
  const responses = symbols.filter((symbol) => symbol?.name === RESPONSE);
  const platform = yield* all(
    ...responses.map(function* (symbol): APIRequestGenerator<boolean> {
      const declarations = symbol?.declarations ?? [];
      const answers = yield* all(...declarations.map((handle) => isPlatform(world, handle)));
      return answers.length > 0 && answers.every(Boolean);
    }),
  );
  return platform.includes(true);
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
    seeds: calls.flatMap((call, at) => seedsOf(call, callees[at] ?? { pkg: null, declaration: undefined, name: null, platform: null })),
    callers,
    readers: new Set(functions.filter((_, at) => reading[at] === true).map((fn) => nodeKey(world, fn))),
  };
}

// The declaration a name reads its value from: a shorthand key's value binding, or the name's own symbol.
function* declarationOf(world: NativeWorld, name: Node, files: ReadonlySet<string>): APIRequestGenerator<Node | undefined> {
  const symbol = isShorthandPropertyAssignment(name) ? yield* world.checker.getShorthandAssignmentValueSymbol.gen(name) : yield* resolvedSymbol(world, name);
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
