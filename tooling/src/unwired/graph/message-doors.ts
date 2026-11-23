// Message doors: a value handed to a Node or browser message door lands in an `any` slot, so it would escape; a door
// pairs each send with the receivers its link names, and a paired value flows into the receiver's typed view of it
// instead (flows.ts carries the pair to its fixpoint). The owner ruling this module serves is roles.ts's: a sent field
// counts as read only where a receiver reads it by name.
//
// Invariants:
// - A door is recognised by its resolved declaration, never by the text at the site: a member or function a library
//   declares (the program's package answer for `@types/node` and the ambient module it sits in, or the compiler's
//   default library for the DOM), matched against {@link DOOR_MEMBERS}. A local `postMessage` is no door.
// - A worker or child process links by module: the parent side of a file links to the modules the file loads by path
//   (`new URL(specifier, import.meta.url)`); the child side of a module links to the files that load it. A file that
//   loads several modules links its parent side to each, which can only add a read.
// - A broadcast or diagnostics channel links by its name's literal, an emitter by its declaration and event literal; a
//   name the walk cannot resolve (`emit(channelFor(key), …)`) links nothing, so its sends stay escapes.
// - The receiver's view is its parameter's declared type when that type names members; otherwise each use of the
//   parameter gives one: an `as` or `satisfies`, a typed variable, or a call's return (`schema.parse(p)`), and a call
//   to our own function whose return names nothing is followed into that function's parameter, ending on a seen-set.
// - A DOM listener receives an event, so its view is the event's `data`.
// - An unpaired send escapes as any opaque hand-off does; an unpaired receiver is reported. `onmessage =` assigns a
//   listener without a call and is not read.
import type {
  ArrowFunction,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
  Node,
  ParameterDeclaration,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBlock,
  isCallExpression,
  isClassDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isModuleDeclaration,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isReturnStatement,
  isSatisfiesExpression,
  isSourceFile,
  isStringLiteral,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import type { FlowPair, Flows, HeldSends } from "./flows.ts";
import { opaqueSlot } from "./flows.ts";
import type { DeclKey } from "./resolve.ts";
import { allOf } from "./resolve.ts";
import type { FileSites } from "./sites.ts";
import type { GraphState, MessageDoor, MessageReceiver } from "./state.ts";
import { isPrimitive } from "./state.ts";

// Where a door member is declared: an ambient module of `@types/node`, or the compiler's DOM library.
const NODE_TYPES = "@types/node";
const DOM = "dom";
const NODE_MODULES = ["worker_threads", "child_process", "process", "events", "diagnostics_channel"] as const;
const ORIGINS = [...NODE_MODULES, DOM] as const;
type Origin = (typeof ORIGINS)[number];

// What a member does at a door: sends a value, takes a listener, spawns a worker with its data, reads that data, or
// opens a named channel.
const ACTS = ["send", "receive", "spawn", "data", "open"] as const;
type Act = (typeof ACTS)[number];
// Which end of a module link the member sits on; a named door links by its name instead.
const SIDES = ["parent", "child", "named"] as const;
type Side = (typeof SIDES)[number];

interface DoorMember {
  readonly origin: Origin;
  /** The class or interface that declares the member; null for a module-level function or variable. */
  readonly container: string | null;
  readonly member: string;
  readonly door: MessageDoor;
  readonly side: Side;
  readonly act: Act;
}

// The listener members a door takes its messages through.
const listen = (at: Omit<DoorMember, "member" | "act">, members: readonly string[]): readonly DoorMember[] =>
  members.map((member) => ({ ...at, member, act: "receive" }));

const NODE_LISTENERS = ["on", "once", "addListener", "prependListener", "prependOnceListener"] as const;

/** Every member a message door is made of, by its declaration. */
const DOOR_MEMBERS: readonly DoorMember[] = [
  { origin: "worker_threads", container: "Worker", member: "Worker", door: "worker", side: "parent", act: "spawn" },
  { origin: "worker_threads", container: "Worker", member: "postMessage", door: "worker", side: "parent", act: "send" },
  ...listen({ origin: "worker_threads", container: "Worker", door: "worker", side: "parent" }, NODE_LISTENERS),
  { origin: "worker_threads", container: "MessagePort", member: "postMessage", door: "worker", side: "child", act: "send" },
  ...listen({ origin: "worker_threads", container: "MessagePort", door: "worker", side: "child" }, NODE_LISTENERS),
  { origin: "worker_threads", container: null, member: "workerData", door: "worker", side: "child", act: "data" },
  { origin: "child_process", container: "ChildProcess", member: "send", door: "ipc", side: "parent", act: "send" },
  ...listen({ origin: "child_process", container: "ChildProcess", door: "ipc", side: "parent" }, NODE_LISTENERS),
  { origin: "process", container: "Process", member: "send", door: "ipc", side: "child", act: "send" },
  ...listen({ origin: "process", container: "Process", door: "ipc", side: "child" }, NODE_LISTENERS),
  { origin: "events", container: "EventEmitter", member: "emit", door: "emitter", side: "named", act: "send" },
  ...listen({ origin: "events", container: "EventEmitter", door: "emitter", side: "named" }, NODE_LISTENERS),
  { origin: "diagnostics_channel", container: null, member: "channel", door: "diagnostics", side: "named", act: "open" },
  { origin: "diagnostics_channel", container: "Channel", member: "publish", door: "diagnostics", side: "named", act: "send" },
  ...listen({ origin: "diagnostics_channel", container: "Channel", door: "diagnostics", side: "named" }, ["subscribe"]),
  ...listen({ origin: "diagnostics_channel", container: null, door: "diagnostics", side: "named" }, ["subscribe"]),
  { origin: DOM, container: "Worker", member: "postMessage", door: "worker", side: "parent", act: "send" },
  ...listen({ origin: DOM, container: "Worker", door: "worker", side: "parent" }, ["addEventListener"]),
  { origin: DOM, container: "MessagePort", member: "postMessage", door: "worker", side: "child", act: "send" },
  ...listen({ origin: DOM, container: "MessagePort", door: "worker", side: "child" }, ["addEventListener"]),
  { origin: DOM, container: "DedicatedWorkerGlobalScope", member: "postMessage", door: "worker", side: "child", act: "send" },
  ...listen({ origin: DOM, container: "DedicatedWorkerGlobalScope", door: "worker", side: "child" }, ["addEventListener"]),
  // a worker module compiled with the DOM library reaches its own scope through the window's globals
  { origin: DOM, container: null, member: "postMessage", door: "worker", side: "child", act: "send" },
  ...listen({ origin: DOM, container: null, door: "worker", side: "child" }, ["addEventListener"]),
  // a window takes messages from any window that posts to it (an iframe's `contentWindow`, its `parent`), so every
  // window send links to every window listener
  { origin: DOM, container: "Window", member: "postMessage", door: "window", side: "named", act: "send" },
  ...listen({ origin: DOM, container: "Window", door: "window", side: "named" }, ["addEventListener"]),
  // the DOM declares a constructor as a global variable beside its interface
  { origin: DOM, container: null, member: "BroadcastChannel", door: "broadcast", side: "named", act: "open" },
  { origin: DOM, container: "BroadcastChannel", member: "postMessage", door: "broadcast", side: "named", act: "send" },
  ...listen({ origin: DOM, container: "BroadcastChannel", door: "broadcast", side: "named" }, ["addEventListener"]),
];

const DOOR_NAMES: ReadonlySet<string> = new Set(DOOR_MEMBERS.map(({ member }) => member));
// The event a module-linked listener takes its messages on.
const MESSAGE_EVENT = "message";
// A DOM listener receives the event; the message is its `data`.
const EVENT_DATA = "data";
const WORKER_DATA_OPTION = "workerData";
const NODE_MODULE_PREFIX = "node:";

// A module link's end: a parent's sends go down to the modules it loads, a child's go up to its loaders.
type Link = { readonly kind: "down" | "up" | "data"; readonly file: string } | { readonly kind: "named"; readonly key: string };

interface Send {
  readonly link: Link;
  readonly door: MessageDoor;
  readonly index: number;
  readonly value: Type;
  readonly file: string;
  readonly at: number;
}

interface Receive {
  readonly link: Link;
  readonly door: MessageDoor;
  readonly index: number;
  readonly views: readonly Type[];
  /** The members an untyped receiver reads off the value by name (`(value) => value.wanted`). */
  readonly names: readonly string[];
  readonly file: string;
  readonly line: number;
}

// One door name site: the member it resolved to and the node it sits on.
interface DoorSite {
  readonly member: DoorMember;
  readonly node: Node;
}

const unwrap = (node: Node): Node => (isParenthesizedExpression(node) || isNonNullExpression(node) ? unwrap(node.expression) : node);

// The expression a name's value stands in once parentheses and `!` are off: `(x)` is x.
function outer(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at.parent) || isNonNullExpression(at.parent)) {
    at = at.parent;
  }
  return at;
}

// The call a door member's name is the callee of: `x.postMessage(v)`, `postMessage(v)`, `new Worker(u)`.
function calleeCall(name: Node): CallExpression | undefined {
  const callee = isPropertyAccessExpression(name.parent) && name.parent.name === name ? name.parent : name;
  const { parent } = callee;
  return isCallExpression(parent) && parent.expression === callee ? parent : undefined;
}

const receiverOf = (call: CallExpression): Node | undefined => (isPropertyAccessExpression(call.expression) ? call.expression.expression : undefined);

// A function-like node a listener argument names: the function itself, or our declaration of the name.
type FunctionLike = ArrowFunction | FunctionExpression | FunctionDeclaration | MethodDeclaration;

const isFunctionLike = (node: Node): node is FunctionLike =>
  isArrowFunction(node) || isFunctionExpression(node) || isFunctionDeclaration(node) || isMethodDeclaration(node);

export class MessageDoors {
  readonly #state: GraphState;
  readonly #sends: Send[] = [];
  readonly #receives: Receive[] = [];
  readonly #loads = new Map<string, Set<string>>();
  readonly #held = new Set<string>();
  readonly #heldTypes = new Map<string, Set<number>>();
  readonly #members = new Map<number, DoorMember | null>();
  readonly unpaired: MessageReceiver[] = [];

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** A file's door sends, which flows.ts leaves to {@link MessageDoors.settle}. */
  held(file: string): HeldSends {
    return { node: (node): boolean => this.#held.has(nodeId(file, node)), types: this.#heldTypes.get(file) ?? new Set() };
  }

  /** A file's door sites, from its resolved name sites. */
  file(sites: FileSites, symbols: readonly (NativeSymbol | undefined)[], resolved: readonly (readonly DeclKey[])[]): void {
    for (const { target } of sites.urlModules) {
      const loads = this.#loads.get(sites.file) ?? new Set<string>();
      loads.add(target);
      this.#loads.set(sites.file, loads);
    }
    const asked = sites.names.flatMap((site, at) => {
      const symbol = symbols[at];
      return !site.declares && symbol !== undefined && DOOR_NAMES.has(symbol.name) && (resolved[at]?.length ?? 0) === 0 ? [{ node: site.node, symbol }] : [];
    });
    if (asked.length === 0) {
      return;
    }
    const members = this.#state.batch(asked.map(({ symbol }) => this.#memberOf(symbol)));
    const doors = asked.flatMap(({ node }, at) => {
      const member = members[at];
      return member === null || member === undefined ? [] : [{ member, node }];
    });
    const state = this.#state;
    state.batch(doors.map((site) => this.#site(site, sites)));
  }

  // The door member a symbol is, by its first declaration a library's module or the DOM library declares.
  *#memberOf(symbol: NativeSymbol): APIRequestGenerator<DoorMember | null> {
    const known = this.#members.get(symbol.id);
    if (known !== undefined) {
      return known;
    }
    let found: DoorMember | null = null;
    for (const handle of symbol.declarations) {
      found ??= yield* this.#declaredMember(handle, symbol.name);
    }
    this.#members.set(symbol.id, found);
    return found;
  }

  *#declaredMember(handle: NodeHandle, name: string): APIRequestGenerator<DoorMember | null> {
    const { world } = this.#state;
    const [dom, pkg, node] = [yield* world.isDefaultLibrary(handle), yield* world.packageOf(handle), yield* handle.resolve.gen()];
    if (node === undefined || (!dom && pkg !== NODE_TYPES)) {
      return null;
    }
    const { container, module } = declarationHome(node);
    const origin = dom ? DOM : module;
    return DOOR_MEMBERS.find((member) => member.origin === origin && member.container === container && member.member === name) ?? null;
  }

  *#site({ member, node }: DoorSite, sites: FileSites): APIRequestGenerator<void> {
    if (member.act === "data") {
      this.#receives.push({
        link: { kind: "data", file: sites.file },
        door: member.door,
        index: 0,
        views: yield* this.#usesView([node], new Set()),
        names: readNames([node]),
        file: sites.file,
        line: sites.lineOf(node),
      });
      return;
    }
    if (member.act === "spawn") {
      yield* this.#spawn(node, sites);
      return;
    }
    const call = calleeCall(node);
    if (call === undefined || member.act === "open") {
      return;
    }
    const link = yield* this.#link(member, call, sites.file);
    if (link === null) {
      return;
    }
    if (member.act === "send") {
      yield* this.#send(member, call, link, sites);
    } else {
      yield* this.#receive(member, call, link, sites);
    }
  }

  // `new Worker(url, { workerData: v })`: v goes down to the worker as its data.
  *#spawn(name: Node, sites: FileSites): APIRequestGenerator<void> {
    const created = name.parent;
    const options = isNewExpression(created) && created.expression === name ? created.arguments?.[1] : undefined;
    if (options === undefined || !isObjectLiteralExpression(options)) {
      return;
    }
    for (const property of options.properties) {
      if (isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === WORKER_DATA_OPTION) {
        const value = yield* this.#state.world.checker.getTypeAtLocation.gen(property.initializer);
        const types = this.#heldTypes.get(sites.file) ?? new Set<number>();
        types.add(value.id);
        this.#heldTypes.set(sites.file, types);
        this.#sends.push({ link: { kind: "data", file: sites.file }, door: "worker", index: 0, value, file: sites.file, at: property.initializer.pos });
      }
    }
  }

  // A door call's link: its side's module link, or a named door's resolved name; null when the name is not a literal.
  *#link(member: DoorMember, call: CallExpression, file: string): APIRequestGenerator<Link | null> {
    if (member.side !== "named") {
      const kind = (member.side === "parent") === (member.act === "send") ? "down" : "up";
      return member.act === "receive" && (yield* this.#literal(call.arguments[0])) !== MESSAGE_EVENT ? null : { kind, file };
    }
    if (member.door === "emitter") {
      return yield* this.#emitterLink(call);
    }
    if (member.door === "window") {
      return member.act === "receive" && (yield* this.#literal(call.arguments[0])) !== MESSAGE_EVENT ? null : { kind: "named", key: member.door };
    }
    const named = receiverOf(call) === undefined ? call.arguments[0] : receiverOf(call);
    const channel = receiverOf(call) === undefined ? yield* this.#literal(named) : yield* this.#channelName(named, member.door, new Set());
    return channel === null ? null : { kind: "named", key: `${member.door}:${channel}` };
  }

  // An emitter links by the declarations its receiver names and the event's literal.
  *#emitterLink(call: CallExpression): APIRequestGenerator<Link | null> {
    const event = yield* this.#literal(call.arguments[0]);
    const receiver = receiverOf(call);
    const symbol = receiver === undefined ? undefined : yield* this.#state.world.checker.getSymbolAtLocation.gen(namePart(receiver));
    const homes = (yield* allOf((symbol?.declarations ?? []).map((handle) => this.#state.resolver.handleKey(handle)))).flatMap((key) =>
      key === null ? [] : [key],
    );
    return event === null || homes.length === 0 ? null : { kind: "named", key: `emitter:${homes.sort().join(",")}:${event}` };
  }

  *#send(member: DoorMember, call: CallExpression, link: Link, sites: FileSites): APIRequestGenerator<void> {
    const values = member.door === "emitter" ? call.arguments.slice(1) : call.arguments.slice(0, 1);
    for (const [index, value] of values.entries()) {
      this.#held.add(nodeId(sites.file, value));
      this.#sends.push({
        link,
        door: member.door,
        index,
        value: yield* this.#state.world.checker.getTypeAtLocation.gen(value),
        file: sites.file,
        at: value.pos,
      });
    }
  }

  *#receive(member: DoorMember, call: CallExpression, link: Link, sites: FileSites): APIRequestGenerator<void> {
    const moduleSubscribe = member.door === "diagnostics" && member.container === null;
    const listenerAt = member.door === "diagnostics" && !moduleSubscribe ? 0 : 1;
    const fn = yield* this.#functionOf(call.arguments[listenerAt]);
    const parameters = fn === undefined ? [] : functionParameters(fn);
    const count = member.door === "emitter" ? Math.max(parameters.length, 1) : 1;
    for (let index = 0; index < count; index += 1) {
      const parameter = parameters[index];
      const views = parameter === undefined || fn === undefined ? [] : yield* this.#parameterView(parameter, fn, member.origin === DOM, new Set());
      const names = parameter === undefined || fn === undefined ? [] : yield* this.#parameterNames(parameter, fn, member.origin === DOM);
      this.#receives.push({ link, door: member.door, index, views, names, file: sites.file, line: sites.lineOf(call) });
    }
  }

  // The function a listener argument is: an inline function, or the declaration our name for it resolves to.
  *#functionOf(argument: Node | undefined): APIRequestGenerator<FunctionLike | undefined> {
    const node = argument === undefined ? undefined : unwrap(argument);
    if (node === undefined || isFunctionLike(node)) {
      return node;
    }
    const symbol = yield* this.#state.world.checker.getSymbolAtLocation.gen(namePart(node));
    for (const handle of (symbol?.declarations ?? []).filter((declaration) => this.#state.resolver.ours(declaration))) {
      const declared = yield* handle.resolve.gen();
      const value = declared !== undefined && (isVariableDeclaration(declared) || isPropertyDeclaration(declared)) ? declared.initializer : declared;
      const fn = value === undefined ? undefined : unwrap(value);
      if (fn !== undefined && isFunctionLike(fn)) {
        return fn;
      }
    }
    return undefined;
  }

  // A parameter's view: its declared type when that names members (a DOM event's `data`), else what its uses give.
  *#parameterView(parameter: ParameterDeclaration, fn: FunctionLike, event: boolean, seen: Set<Node>): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const { name } = parameter;
    const declared = yield* checker.getTypeAtLocation.gen(name);
    const data = event ? yield* checker.getPropertyOfType.gen(declared, EVENT_DATA) : undefined;
    const typed = data === undefined ? declared : yield* checker.getTypeOfSymbol.gen(data);
    if (!(yield* opaqueSlot(this.#state, typed))) {
      return [typed];
    }
    const symbol = yield* checker.getSymbolAtLocation.gen(name);
    const uses = symbol === undefined ? [] : yield* this.#references(fn, symbol);
    const reads = event ? uses.flatMap((use) => (isPropertyAccessExpression(use.parent) && use.parent.name.text === EVENT_DATA ? [use.parent] : [])) : uses;
    return yield* this.#usesView(reads, seen);
  }

  // The members a received parameter's uses read by name; through a DOM event's `data` for an event.
  *#parameterNames(parameter: ParameterDeclaration, fn: FunctionLike, event: boolean): APIRequestGenerator<readonly string[]> {
    const symbol = yield* this.#state.world.checker.getSymbolAtLocation.gen(parameter.name);
    const uses = symbol === undefined ? [] : yield* this.#references(fn, symbol);
    return readNames(event ? uses.flatMap((use) => (isPropertyAccessExpression(use.parent) && use.parent.name.text === EVENT_DATA ? [use.parent] : [])) : uses);
  }

  // What each use of a received value types it as.
  *#usesView(uses: readonly Node[], seen: Set<Node>): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const views: Type[] = [];
    for (const use of uses) {
      const at = outer(use);
      const up = at.parent;
      const typedAt = typedHolder(up);
      const argumentAt = isCallExpression(up) ? up.arguments.findIndex((argument) => argument === at) : -1;
      if (typedAt !== undefined) {
        views.push(yield* checker.getTypeAtLocation.gen(typedAt));
      } else if (isCallExpression(up) && argumentAt >= 0) {
        views.push(...(yield* this.#callView(up, argumentAt, seen)));
      }
    }
    const opaque = yield* allOf(views.map((view) => opaqueSlot(this.#state, view)));
    return views.filter((_, at) => opaque[at] !== true);
  }

  // A call a received value is handed to: its return when that names members, else our function's parameter.
  *#callView(call: CallExpression, index: number, seen: Set<Node>): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const returned = yield* checker.getTypeAtLocation.gen(call);
    if (!(isPrimitive(returned) || (yield* opaqueSlot(this.#state, returned)))) {
      return [returned];
    }
    const target = (yield* checker.getResolvedSignature.gen(call)).declaration;
    const declared = target !== undefined && this.#state.resolver.ours(target) ? yield* target.resolve.gen() : undefined;
    const fn = declared !== undefined && isFunctionLike(declared) ? declared : undefined;
    const parameter = fn === undefined ? undefined : functionParameters(fn)[index];
    if (fn === undefined || parameter === undefined || seen.has(parameter)) {
      return [];
    }
    seen.add(parameter);
    return yield* this.#parameterView(parameter, fn, false, seen);
  }

  // The identifiers in a function's body that name `symbol`.
  *#references(fn: FunctionLike, symbol: NativeSymbol): APIRequestGenerator<readonly Node[]> {
    const { checker } = this.#state.world;
    const candidates: Node[] = [];
    const visit = (node: Node): void => {
      if (isIdentifier(node) && node.text === symbol.name) {
        candidates.push(node);
      }
      node.forEachChild(visit);
    };
    if (fn.body !== undefined) {
      visit(fn.body);
    }
    const symbols = yield* allOf(candidates.map((node) => checker.getSymbolAtLocation.gen(node)));
    return candidates.filter((_, at) => symbols[at]?.id === symbol.id);
  }

  // A string literal's text, or the single literal its type is.
  *#literal(node: Node | undefined): APIRequestGenerator<string | null> {
    if (node === undefined) {
      return null;
    }
    if (isStringLiteral(node)) {
      return node.text;
    }
    const type = yield* this.#state.world.checker.getTypeAtLocation.gen(node);
    return type.isStringLiteralType() ? type.value : null;
  }

  // The name a channel value was opened with: a `new BroadcastChannel(name)` or diagnostics `channel(name)` its
  // expression reaches through our variables, fields and function returns.
  *#channelName(expression: Node | undefined, door: MessageDoor, seen: Set<Node>): APIRequestGenerator<string | null> {
    const node = expression === undefined ? undefined : unwrap(expression);
    if (node === undefined || seen.has(node)) {
      return null;
    }
    seen.add(node);
    if (isNewExpression(node) || isCallExpression(node)) {
      const opened = yield* this.#opened(node, door);
      if (opened !== undefined) {
        return yield* this.#literal(opened);
      }
    }
    for (const next of yield* this.#sources(node)) {
      const name = yield* this.#channelName(next, door, seen);
      if (name !== null) {
        return name;
      }
    }
    return null;
  }

  // The name argument of a door's `open` member this call or construction is.
  *#opened(node: Node, door: MessageDoor): APIRequestGenerator<Node | undefined> {
    if (!(isNewExpression(node) || isCallExpression(node))) {
      return undefined;
    }
    const { checker } = this.#state.world;
    const named = yield* checker.getSymbolAtLocation.gen(namePart(node.expression));
    const symbol = named !== undefined && hasFlag(named.flags, SymbolFlags.Alias) ? yield* checker.getAliasedSymbol.gen(named) : named;
    const member = symbol === undefined || !DOOR_NAMES.has(symbol.name) ? null : yield* this.#memberOf(symbol);
    return member?.act === "open" && member.door === door ? node.arguments?.[0] : undefined;
  }

  // The expressions a value comes from: our declaration's initializer, or the returns of our function it calls.
  *#sources(node: Node): APIRequestGenerator<readonly Node[]> {
    const { checker } = this.#state.world;
    if (isCallExpression(node)) {
      const target = (yield* checker.getResolvedSignature.gen(node)).declaration;
      const fn = target !== undefined && this.#state.resolver.ours(target) ? yield* target.resolve.gen() : undefined;
      return fn !== undefined && isFunctionLike(fn) ? returnsOf(fn) : [];
    }
    const symbol = yield* checker.getSymbolAtLocation.gen(namePart(node));
    const out: Node[] = [];
    for (const handle of (symbol?.declarations ?? []).filter((declaration) => this.#state.resolver.ours(declaration))) {
      const declared = yield* handle.resolve.gen();
      if (declared !== undefined && symbol !== undefined) {
        out.push(...(yield* this.#declaredValues(declared, symbol)));
      }
    }
    return out;
  }

  // A variable's or field's values: its initializer, and what a `let` or a field is set to later (`channel = opened`).
  *#declaredValues(declared: Node, symbol: NativeSymbol): APIRequestGenerator<readonly Node[]> {
    if (!(isVariableDeclaration(declared) || isPropertyDeclaration(declared))) {
      return [];
    }
    return [...(declared.initializer === undefined ? [] : [declared.initializer]), ...(yield* this.#assignedTo(declared.getSourceFile(), symbol))];
  }

  // The values a file assigns to a symbol: `x = v` and `this.x = v`.
  *#assignedTo(file: Node, symbol: NativeSymbol): APIRequestGenerator<readonly Node[]> {
    const { checker } = this.#state.world;
    const assignments: { readonly target: Node; readonly value: Node }[] = [];
    const visit = (node: Node): void => {
      if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.EqualsToken) {
        const target = namePart(unwrap(node.left));
        if (isIdentifier(target) && target.text === symbol.name) {
          assignments.push({ target, value: node.right });
        }
      }
      node.forEachChild(visit);
    };
    visit(file);
    const symbols = yield* allOf(assignments.map(({ target }) => checker.getSymbolAtLocation.gen(target)));
    return assignments.filter((_, at) => symbols[at]?.id === symbol.id).map(({ value }) => value);
  }

  /** Pair every send with the receivers its link names: a pair flows into the receiver's view, an unpaired send
   *  escapes, and an unpaired receiver is reported. */
  settle(flows: Flows): void {
    const paired = new Set<Receive>();
    const pairs = new Map<string, FlowPair[]>();
    const state = this.#state;
    for (const send of this.#sends) {
      const receivers = this.#receives.filter((receive) => receive.door === send.door && receive.index === send.index && this.#linked(send.link, receive.link));
      for (const receive of receivers) {
        paired.add(receive);
        const into = pairs.get(receive.file) ?? [];
        into.push(...receive.views.map((slot) => ({ slot, value: send.value })));
        pairs.set(receive.file, into);
        state.roleAll(state.slotMembers(receive.names.map((name) => ({ type: send.value, name }))).flat(), "read", receive.file, 0);
      }
      // a send no receiver types goes on as an opaque hand-off does; a by-name read above still reads its member
      if (!receivers.some((receive) => receive.views.length > 0)) {
        flows.escape(send.value, false, send.file, send.at);
      }
    }
    for (const [file, filePairs] of pairs) {
      flows.link(filePairs, file);
    }
    for (const receive of this.#receives.filter((entry) => !paired.has(entry))) {
      this.unpaired.push({ file: receive.file, line: receive.line, door: receive.door });
    }
  }

  // Whether a send's link reaches a receiver's: down from a loader to a module it loads, up from a module to a loader.
  #linked(send: Link, receive: Link): boolean {
    if (send.kind === "named" || receive.kind === "named") {
      return send.kind === "named" && receive.kind === "named" && send.key === receive.key;
    }
    if (send.kind !== receive.kind) {
      return false;
    }
    const [loader, loaded] = send.kind === "up" ? [receive.file, send.file] : [send.file, receive.file];
    return this.#loads.get(loader)?.has(loaded) === true;
  }
}

// The member names uses read off a value: `value.wanted`.
function readNames(uses: readonly Node[]): readonly string[] {
  return uses.flatMap((use) => {
    const at = outer(use);
    return isPropertyAccessExpression(at.parent) && at.parent.expression === at ? [at.parent.name.text] : [];
  });
}

// The node whose type a use's holder declares: `x as T`, `x satisfies T`, `const y: T = x`.
function typedHolder(up: Node): Node | undefined {
  if (isAsExpression(up) || isSatisfiesExpression(up)) {
    return up;
  }
  return isVariableDeclaration(up) && up.type !== undefined ? up.name : undefined;
}

const nodeId = (file: string, node: Node): string => `${file}#${String(node.pos)}-${String(node.end)}`;

// The name a reference's symbol is asked at: `x` for `x`, `k` for `a.b.k`.
const namePart = (node: Node): Node => (isPropertyAccessExpression(node) ? node.name : node);

const functionParameters = (fn: FunctionLike): readonly ParameterDeclaration[] => fn.parameters;

// A function's returned expressions, its own and not a nested function's; an expression body is its one return.
function returnsOf(fn: FunctionLike): readonly Node[] {
  const { body } = fn;
  if (body === undefined) {
    return [];
  }
  if (!isBlock(body)) {
    return [body];
  }
  const out: Node[] = [];
  const visit = (node: Node): void => {
    if (isReturnStatement(node) && node.expression !== undefined) {
      out.push(node.expression);
    }
    if (!isFunctionLike(node)) {
      node.forEachChild(visit);
    }
  };
  body.forEachChild(visit);
  return out;
}

// Where a library declaration sits: the class or interface that holds it (or is it), and the ambient module around it.
function declarationHome(node: Node): { readonly container: string | null; readonly module: Origin | null } {
  let container: string | null = null;
  let module: Origin | null = null;
  for (let at = node; module === null && !isSourceFile(at); at = at.parent) {
    if (container === null && (isClassDeclaration(at) || isInterfaceDeclaration(at))) {
      container = at.name?.text ?? null;
    }
    if (isModuleDeclaration(at) && isStringLiteral(at.name)) {
      module = nodeModule(at.name.text);
    }
  }
  return { container, module };
}

function nodeModule(name: string): Origin | null {
  const bare = name.startsWith(NODE_MODULE_PREFIX) ? name.slice(NODE_MODULE_PREFIX.length) : name;
  return NODE_MODULES.find((module) => module === bare) ?? null;
}
