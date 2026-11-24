// Value traces: where one value at a hand-off came from, followed by declarations and never by type. A slot can name a
// member the value's static type dropped on the way (`ShapedHistoryRow & { extraTokens }` handed on as
// `ShapedHistoryRow`); the member reaches the slot only along that value's own trace, so two values widened into one
// type stay apart.
//
// - A trace walks back from the value with a path of member and element steps: an identifier to its `const`
//   initializer, a `for…of` binding to its list's elements, an array method's callback parameter to its receiver's
//   elements, a parameter of ours to the argument each call hands it, a call of ours to its returns, `x.m` to `x`, and a
//   literal, a conditional or `??`/`||` to the part the path names. It ends at the first value whose type, the path
//   applied, names a missing member of ours: that type fills the slot.
// - The calls a walk entered through their returns are its context. A parameter takes the argument of its own
//   function's call in that context, wherever the call sits in it, so a closure inside the callee reads the callee's
//   argument. A parameter reached with no context takes every call's. A parameter of a function whose call is not in a
//   nonempty context belongs to a closure made by a call the walk never saw, and ends the walk there.
// - A branch the hop budget or the context depth stops credits nothing; an origin the walk proved before the stop
//   keeps its credit, as it is that value's own trace.
// - A rest parameter and a spread argument end the trace: an argument forwarded by `(...args) => f(...args)` is not
//   followed.
import type { CallExpression, Expression, NewExpression, Node } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isConditionalExpression,
  isElementAccessExpression,
  isForOfStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNumericLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isVariableDeclaration,
  isVariableDeclarationList,
  NodeFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { IndexKind } from "@typescript/native/sync";
import type { ListResult } from "../list-methods.ts";
import { methodCallOf, RESULTS } from "../list-methods.ts";
import { declarationKeys, hasFlag } from "../native.ts";
import { answer, keyText } from "./resolve.ts";
import type { GraphState } from "./state.ts";

/** A hand-off whose slot names members of ours the value's type lacks: the trace starts at `node`. */
export interface TraceRequest {
  readonly node: Expression;
  readonly slot: Type;
  /** The names of the slot members of ours the value's type lacks. */
  readonly missing: readonly string[];
  readonly file: string;
  readonly site: number;
}

// One step from a value to a part of it: a named member, or a list's element.
type PathStep = { readonly kind: "member"; readonly name: string } | { readonly kind: "element" };
type Path = readonly PathStep[];
const ELEMENT: PathStep = { kind: "element" };

// A call entered through its returns, and the function whose body the trace is in.
interface Frame {
  readonly call: CallExpression | NewExpression;
  readonly callee: Node;
}

// The array methods whose callback takes the receiver's elements, by the callback parameter that takes them.
const ELEMENT_PARAMETERS: ReadonlyMap<string, readonly number[]> = new Map<string, readonly number[]>([
  ...["forEach", "map", "flatMap", "filter", "find", "findLast", "findIndex", "findLastIndex", "some", "every"].map((name): [string, readonly number[]] => [
    name,
    [0],
  ]),
  ...["reduce", "reduceRight"].map((name): [string, readonly number[]] => [name, [1]]),
  ...["sort", "toSorted"].map((name): [string, readonly number[]] => [name, [0, 1]]),
]);

const pathKey = (path: Path): string => path.map((step) => (step.kind === "element" ? "[]" : `.${step.name}`)).join("");
const nodeKey = (node: Node): string => `${node.getSourceFile().fileName}:${String(node.pos)}:${String(node.end)}`;
const isFunctionLike = (node: Node): boolean => isArrowFunction(node) || isFunctionExpression(node) || isFunctionDeclaration(node) || isMethodDeclaration(node);

// The value under parentheses, a non-null assertion, a type assertion and a `satisfies` check.
function unwrapped(node: Expression): Expression {
  let at = node;
  while (isParenthesizedExpression(at) || isNonNullExpression(at) || isAsExpression(at) || isSatisfiesExpression(at)) {
    at = at.expression;
  }
  return at;
}

// The values an expression can be: each branch of a conditional, each operand of `??` and `||`.
function branches(node: Expression): readonly Expression[] {
  if (isConditionalExpression(node)) {
    return [unwrapped(node.whenTrue), unwrapped(node.whenFalse)];
  }
  if (isBinaryExpression(node) && (node.operatorToken.kind === SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === SyntaxKind.BarBarToken)) {
    return [unwrapped(node.left), unwrapped(node.right)];
  }
  return [];
}

// The values a function returns: an arrow's expression body, else each `return` outside nested functions and classes.
function returnsOf(fn: Node): readonly Expression[] {
  const body = "body" in fn ? (fn.body as Node | undefined) : undefined;
  if (body === undefined) {
    return [];
  }
  if (!isBlock(body)) {
    return [body as Expression];
  }
  const out: Expression[] = [];
  const visit = (node: Node): void => {
    if (isFunctionLike(node) || isClassDeclaration(node) || isClassExpression(node)) {
      return;
    }
    if (isReturnStatement(node) && node.expression !== undefined) {
      out.push(node.expression);
    }
    node.forEachChild(visit);
  };
  body.forEachChild(visit);
  return out;
}

// One request's walk: the hops it took, the steps it has seen and the origins it found. `halted` marks a walk the hop
// budget ended; `stopped` marks one a bound cut anywhere.
interface Run {
  readonly request: TraceRequest;
  hops: number;
  readonly seen: Set<string>;
  readonly found: Type[];
  halted: boolean;
  stopped: boolean;
}

// One step of a walk: a value, the path from it to the traced part, and the calls entered through their returns,
// innermost last.
interface Item {
  readonly node: Expression;
  readonly path: Path;
  readonly stack: readonly Frame[];
  readonly run: Run;
}

// The declaration an identifier names: its node, and the keys its symbol's declarations go by.
interface Named {
  readonly node: Node;
  readonly key: string;
}

/** The hops one request may take before it stops and credits nothing. */
export const HOP_BUDGET = 400;
/** The calls a trace may be inside at once through their returns; a trace that would enter one more credits nothing. */
export const DEPTH_CAP = 8;

/** The counters a build's value traces add to the graph's counts. */
export const TRACE_COUNTS = {
  requests: "value trace requests",
  levels: "value trace levels",
  hops: "value trace hops",
  stopped: "value traces stopped by a bound",
  origins: "value traces with an origin",
  asked: "value trace node queries",
  remembered: "value trace remembered answers",
  fanOut: "value trace call-site fan-out",
  unbound: "value trace closures of an unseen call",
} as const;

/**
 * Traces values back to the declarations that keep a member a slot names. Every request walks in one breadth-first
 * front: each level asks the compiler about all its nodes at once, through the array forms where the API has them, and
 * remembers each node's answer and each call's callee for later levels and requests.
 */
export class ValueTracer {
  readonly #state: GraphState;
  // Every argument our calls hand each parameter, by the parameter's declaration keys.
  readonly #arguments = new Map<string, Expression[]>();
  // Per value node: its type, the declaration it names, whether it is a list. Per call: the function of ours it calls.
  readonly #types = new Map<string, Type>();
  readonly #named = new Map<string, Named | null>();
  readonly #lists = new Map<string, boolean>();
  readonly #callees = new Map<string, Node | null>();

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** Note an argument a call hands the parameter whose declaration keys are `parameter`. */
  argument(parameter: string, node: Expression): void {
    const list = this.#arguments.get(parameter);
    if (list === undefined) {
      this.#arguments.set(parameter, [node]);
    } else {
      list.push(node);
    }
  }

  /** The types each request's value had where it still named a missing member, along the branches no bound cut. */
  origins(requests: readonly TraceRequest[]): readonly (readonly Type[])[] {
    const { state } = this;
    const runs = requests.map((request): Run => ({ request, hops: 0, seen: new Set(), found: [], halted: false, stopped: false }));
    let front: readonly Item[] = runs.map((run) => ({ node: unwrapped(run.request.node), path: [], stack: [], run }));
    while (front.length > 0) {
      state.count(TRACE_COUNTS.levels);
      front = this.#level(front.filter((item) => this.#admitted(item)));
    }
    return runs.map((run) => {
      state.count(TRACE_COUNTS.hops, run.hops);
      if (run.stopped) {
        state.count(TRACE_COUNTS.stopped);
      }
      const unique = [...new Map(run.found.map((type) => [type.id, type])).values()];
      if (unique.length > 0) {
        state.count(TRACE_COUNTS.origins);
      }
      return unique;
    });
  }

  get state(): GraphState {
    return this.#state;
  }

  // Whether a step is new to its walk and inside its budget; a step past the budget stops the walk.
  #admitted({ node, path, stack, run }: Item): boolean {
    const key = `${nodeKey(node)}${pathKey(path)}|${stack.map(({ call }) => nodeKey(call)).join(">")}`;
    if (run.halted || run.seen.has(key)) {
      return false;
    }
    if (run.hops >= HOP_BUDGET) {
      run.halted = true;
      run.stopped = true;
      return false;
    }
    run.hops += 1;
    run.seen.add(key);
    return true;
  }

  // One level: the steps whose value names a missing member end there; the others step back once.
  #level(items: readonly Item[]): readonly Item[] {
    const types = this.#typesOf(items.map(({ node }) => node));
    const named = this.#state.batch(items.map((item, at) => this.#namingType(types[at], item)));
    const open: Item[] = [];
    for (const [at, item] of items.entries()) {
      const type = named[at];
      if (type === undefined) {
        open.push(item);
      } else {
        item.run.found.push(type);
      }
    }
    return this.#stepBack(open.filter(({ run }) => !run.halted));
  }

  // The value's type with its path applied, where it names a missing member of ours other than the slot's own.
  *#namingType(start: Type | undefined, { path, run }: Item): APIRequestGenerator<Type | undefined> {
    const { checker } = this.#state.world;
    let at = start;
    for (const step of path) {
      if (at === undefined) {
        return undefined;
      }
      const bare: Type = yield* checker.getNonNullableType.gen(at);
      at = step.kind === "member" ? yield* checker.getTypeOfPropertyOfType.gen(bare, step.name) : yield* checker.getIndexTypeOfType.gen(bare, IndexKind.Number);
    }
    if (at === undefined) {
      return undefined;
    }
    const bare: Type = yield* checker.getNonNullableType.gen(at);
    for (const name of run.request.missing) {
      const member = yield* checker.getPropertyOfType.gen(bare, name);
      if (member?.declarations.some((handle) => this.#state.resolver.ours(handle)) === true) {
        return at;
      }
    }
    return undefined;
  }

  // The steps back from each value: syntax decides most; identifiers and calls ask the compiler, all at once.
  #stepBack(items: readonly Item[]): readonly Item[] {
    const out: Item[] = [];
    const identifiers: Item[] = [];
    const calls: (Item & { readonly node: CallExpression | NewExpression })[] = [];
    for (const item of items) {
      const { node } = item;
      if (isIdentifier(node)) {
        identifiers.push(item);
      } else if (isCallExpression(node) || isNewExpression(node)) {
        calls.push({ ...item, node });
      } else {
        out.push(...syntaxSteps(item));
      }
    }
    return [...out, ...this.#identifierSteps(identifiers), ...this.#callSteps(calls)];
  }

  // An identifier steps to its `const` initializer, its `for…of` list, its destructured initializer, or its parameter's
  // arguments.
  #identifierSteps(items: readonly Item[]): readonly Item[] {
    const named = this.#namedOf(items.map(({ node }) => node));
    const out: Item[] = [];
    const callbacks: { readonly item: Item; readonly receiver: Expression }[] = [];
    for (const [at, item] of items.entries()) {
      const declaration = named[at];
      const step = declaration === null || declaration === undefined ? null : declaredStep(declaration, item);
      if (step?.kind === "steps") {
        out.push(...step.items);
      } else if (step?.kind === "parameter" && declaration !== null && declaration !== undefined) {
        out.push(...this.#argumentSteps(item, step.fn, step.index, declaration.key));
      } else if (step?.kind === "receiver") {
        callbacks.push({ item, receiver: step.receiver });
      }
    }
    const lists = this.#listsOf(callbacks.map(({ receiver }) => receiver));
    for (const [at, { item, receiver }] of callbacks.entries()) {
      if (lists[at] === true) {
        out.push({ ...item, node: unwrapped(receiver), path: [ELEMENT, ...item.path] });
      }
    }
    return out;
  }

  // A parameter of ours takes the argument of its function's innermost call in the walk's context, and the walk goes on
  // in the caller's context; with no context it takes every call's argument.
  #argumentSteps(item: Item, fn: Node, index: number, key: string): readonly Item[] {
    const own = nodeKey(fn);
    const at = item.stack.findLastIndex(({ callee }) => nodeKey(callee) === own);
    const frame = item.stack[at];
    if (frame !== undefined) {
      const argument = frame.call.arguments?.[index];
      return argument === undefined || isSpreadElement(argument) ? [] : [{ ...item, node: unwrapped(argument), stack: item.stack.slice(0, at) }];
    }
    if (item.stack.length > 0) {
      this.#state.count(TRACE_COUNTS.unbound);
      return [];
    }
    const handed = this.#arguments.get(key) ?? [];
    this.#state.count(TRACE_COUNTS.fanOut, handed.length);
    return handed.map((argument) => ({ ...item, node: unwrapped(argument) }));
  }

  // A call steps into an array method's receiver or its callback's returns, else into the returns of the function of
  // ours it calls, which becomes the walk's innermost context.
  #callSteps(items: readonly (Item & { readonly node: CallExpression | NewExpression })[]): readonly Item[] {
    const methods = items.map(({ node }) => {
      const callee = node.expression;
      const result = isCallExpression(node) && isPropertyAccessExpression(callee) ? RESULTS.get(callee.name.text) : undefined;
      return result === undefined || !isPropertyAccessExpression(callee) ? undefined : { result, receiver: callee.expression };
    });
    const asked = methods.flatMap((method) => (method === undefined ? [] : [method.receiver]));
    const answers = this.#listsOf(asked);
    const lists = new Map(asked.map((receiver, at) => [receiver, answers[at] === true]));
    const out: Item[] = [];
    const ours: (Item & { readonly node: CallExpression | NewExpression })[] = [];
    for (const [at, item] of items.entries()) {
      const method = methods[at];
      if (method !== undefined && lists.get(method.receiver) === true && isCallExpression(item.node)) {
        out.push(...listSteps(item.node, method, item));
      } else {
        ours.push(item);
      }
    }
    const callees = this.#calleesOf(ours.map(({ node }) => node));
    for (const [at, item] of ours.entries()) {
      const fn = callees[at];
      if (fn === null || fn === undefined) {
        continue;
      }
      if (item.stack.length >= DEPTH_CAP) {
        item.run.stopped = true;
        continue;
      }
      const stack = [...item.stack, { call: item.node, callee: fn }];
      out.push(...returnsOf(fn).map((value) => ({ ...item, node: unwrapped(value), stack })));
    }
    return out;
  }

  // The nodes a level asks about that no earlier level asked, deduplicated by span.
  #fresh<T>(nodes: readonly Node[], known: ReadonlyMap<string, T>): readonly Node[] {
    const fresh = new Map<string, Node>();
    for (const node of nodes) {
      const key = nodeKey(node);
      if (!known.has(key)) {
        fresh.set(key, node);
      }
    }
    this.#state.count(TRACE_COUNTS.asked, fresh.size);
    this.#state.count(TRACE_COUNTS.remembered, nodes.length - fresh.size);
    return [...fresh.values()];
  }

  // Each node's type, through the array form.
  #typesOf(nodes: readonly Node[]): readonly (Type | undefined)[] {
    const fresh = this.#fresh(nodes, this.#types);
    for (const [at, type] of this.#state.world.typesAt(fresh).entries()) {
      const node = fresh[at];
      if (node !== undefined) {
        this.#types.set(nodeKey(node), type);
      }
    }
    return nodes.map((node) => this.#types.get(nodeKey(node)));
  }

  // The declaration of ours each identifier names, through the symbols' array form and one batch of handle resolves.
  #namedOf(nodes: readonly Node[]): readonly (Named | null | undefined)[] {
    const { state } = this;
    const fresh = this.#fresh(nodes, this.#named);
    const symbols = state.world.symbolsAt(fresh);
    const handles = symbols.map((symbol) => {
      const [handle] = symbol?.declarations ?? [];
      return handle !== undefined && state.resolver.ours(handle) ? handle : undefined;
    });
    const resolved = state.batch(handles.map((handle) => (handle === undefined ? answer<Node | undefined>(undefined) : handle.resolve.gen())));
    for (const [at, node] of fresh.entries()) {
      const [symbol, declaration] = [symbols[at], resolved[at]];
      this.#named.set(nodeKey(node), symbol === undefined || declaration === undefined ? null : { node: declaration, key: declarationKeys(symbol).join(",") });
    }
    return nodes.map((node) => this.#named.get(nodeKey(node)));
  }

  // Whether each value is a list, its null and undefined removed.
  #listsOf(nodes: readonly Node[]): readonly (boolean | undefined)[] {
    const { checker } = this.#state.world;
    const fresh = this.#fresh(nodes, this.#lists);
    const types = this.#typesOf(fresh);
    const answers = this.#state.batch(
      types.map(function* (type): APIRequestGenerator<boolean> {
        return type !== undefined && (yield* checker.isArrayLikeType.gen(yield* checker.getNonNullableType.gen(type)));
      }),
    );
    for (const [at, node] of fresh.entries()) {
      this.#lists.set(nodeKey(node), answers[at] === true);
    }
    return nodes.map((node) => this.#lists.get(nodeKey(node)));
  }

  // The function of ours each call resolves to, null for a library's or a call with no body to read.
  #calleesOf(calls: readonly (CallExpression | NewExpression)[]): readonly (Node | null | undefined)[] {
    const { state } = this;
    const fresh = this.#fresh(calls, this.#callees) as readonly (CallExpression | NewExpression)[];
    const found = state.batch(
      fresh.map(function* (call): APIRequestGenerator<Node | null> {
        const { declaration } = yield* state.world.checker.getResolvedSignature.gen(call);
        if (declaration === undefined || !state.resolver.ours(declaration)) {
          return null;
        }
        const fn = yield* declaration.resolve.gen();
        return fn !== undefined && isFunctionLike(fn) ? fn : null;
      }),
    );
    for (const [at, call] of fresh.entries()) {
      this.#callees.set(nodeKey(call), found[at] ?? null);
    }
    return calls.map((call) => this.#callees.get(nodeKey(call)));
  }
}

// The steps syntax alone decides: a branch, a member or element read, a list or object literal's part.
function syntaxSteps(item: Item): readonly Item[] {
  const { node, path } = item;
  const either = branches(node);
  if (either.length > 0) {
    return either.map((branch) => ({ ...item, node: branch }));
  }
  if (isPropertyAccessExpression(node)) {
    return [{ ...item, node: unwrapped(node.expression), path: [{ kind: "member", name: node.name.text }, ...path] }];
  }
  if (isElementAccessExpression(node) && isNumericLiteral(node.argumentExpression)) {
    return [{ ...item, node: unwrapped(node.expression), path: [ELEMENT, ...path] }];
  }
  const [head, ...rest] = path;
  if (isArrayLiteralExpression(node) && head?.kind === "element") {
    return node.elements.map((element) =>
      isSpreadElement(element) ? { ...item, node: unwrapped(element.expression) } : { ...item, node: unwrapped(element), path: rest },
    );
  }
  if (isObjectLiteralExpression(node) && head?.kind === "member") {
    return literalMemberSteps(node.properties, head.name, item);
  }
  return [];
}

// A literal's member: its own property when it spells one, else the spreads that may carry it.
function literalMemberSteps(properties: readonly Node[], name: string, item: Item): readonly Item[] {
  const rest = item.path.slice(1);
  for (const property of [...properties].reverse()) {
    if (isPropertyAssignment(property) && keyText(property.name) === name) {
      return [{ ...item, node: unwrapped(property.initializer), path: rest }];
    }
    if (isShorthandPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === name) {
      return [{ ...item, node: property.name, path: rest }];
    }
  }
  return properties.flatMap((property) => (isSpreadAssignment(property) ? [{ ...item, node: unwrapped(property.expression) }] : []));
}

// A binding's step: a `for…of` binding to its list's elements, a `const` to its initializer, a destructured `const`
// member to its initializer's member.
function bindingSteps(declaration: Node, item: Item): readonly Item[] {
  if (isVariableDeclaration(declaration)) {
    const list = declaration.parent;
    if (isVariableDeclarationList(list) && isForOfStatement(list.parent)) {
      return [{ ...item, node: unwrapped(list.parent.expression), path: [ELEMENT, ...item.path] }];
    }
    return declaration.initializer !== undefined && isVariableDeclarationList(list) && hasFlag(list.flags, NodeFlags.Const)
      ? [{ ...item, node: unwrapped(declaration.initializer) }]
      : [];
  }
  if (!isBindingElement(declaration) || declaration.dotDotDotToken !== undefined || !isObjectBindingPattern(declaration.parent)) {
    return [];
  }
  const holder = declaration.parent.parent;
  const name = keyText(declaration.propertyName ?? declaration.name);
  if (name === undefined || !isVariableDeclaration(holder) || holder.initializer === undefined) {
    return [];
  }
  const list = holder.parent;
  return isVariableDeclarationList(list) && hasFlag(list.flags, NodeFlags.Const)
    ? [{ ...item, node: unwrapped(holder.initializer), path: [{ kind: "member", name }, ...item.path] }]
    : [];
}

// What the declaration an identifier names gives the walk: steps its syntax decides, a parameter of ours whose
// arguments it takes, or the receiver of the array method whose callback takes its elements.
function declaredStep(
  declaration: Named,
  item: Item,
):
  | { readonly kind: "steps"; readonly items: readonly Item[] }
  | { readonly kind: "parameter"; readonly fn: Node; readonly index: number }
  | { readonly kind: "receiver"; readonly receiver: Expression }
  | null {
  if (!isParameterDeclaration(declaration.node)) {
    return { kind: "steps", items: bindingSteps(declaration.node, item) };
  }
  const place = parameterPlace(declaration.node);
  if (place === undefined) {
    return null;
  }
  if (place.method === undefined) {
    return { kind: "parameter", fn: place.fn, index: place.index };
  }
  return (ELEMENT_PARAMETERS.get(place.method.method) ?? []).includes(place.index) ? { kind: "receiver", receiver: place.method.receiver } : null;
}

// Where a parameter sits: its function and index, and the array method its function is a callback of. A rest
// parameter has no place a single argument fills.
function parameterPlace(
  declaration: Node & { readonly dotDotDotToken?: Node | undefined },
): { readonly fn: Node; readonly index: number; readonly method: ReturnType<typeof methodCallOf> } | undefined {
  const fn = declaration.parent;
  if (declaration.dotDotDotToken !== undefined || !isFunctionLike(fn)) {
    return undefined;
  }
  const index = (fn as Node & { readonly parameters: readonly Node[] }).parameters.findIndex((parameter) => parameter.pos === declaration.pos);
  const method = isArrowFunction(fn) || isFunctionExpression(fn) ? methodCallOf(fn) : undefined;
  return { fn, index, method: method !== undefined && ELEMENT_PARAMETERS.has(method.method) ? method : undefined };
}

// An array method's result: the receiver's own elements, one of them, or its callback's returns.
function listSteps(call: CallExpression, { result, receiver }: { readonly result: ListResult; readonly receiver: Expression }, item: Item): readonly Item[] {
  if (result === "same") {
    return [{ ...item, node: unwrapped(receiver) }];
  }
  if (result === "element") {
    return [{ ...item, node: unwrapped(receiver), path: [ELEMENT, ...item.path] }];
  }
  const [callback] = call.arguments;
  const [head, ...rest] = item.path;
  if (callback === undefined || head?.kind !== "element" || !(isArrowFunction(callback) || isFunctionExpression(callback))) {
    return [];
  }
  return returnsOf(callback).map((value) => ({ ...item, node: unwrapped(value), path: result === "mapped" ? rest : item.path }));
}
