// The texts a string expression can take, followed through the checker for the DOM-hook pass (./dom.ts). A value is
// asked for at a path (an element of a list, an index of a tuple, a property of an object, a value of a Map), so a name
// held deep in a table is reached through the code that builds the table:
//
// - a literal type answers first; otherwise a name follows its symbol's declarations: an initializer, the list a for-of
//   walks, a destructured binding's place in its source, a parameter's default and each caller's argument, and the
//   element a list method hands its callback;
// - a member a type declares with no value of its own (`row.name` on an interface) is asked of its object instead;
// - a call yields its callee's returns, and the list methods carry the path through: `map` and `flatMap` through the
//   callback's returns, `filter` and the copies through the receiver, `find` and `at` to an element, a Map's
//   `get` to the value of each entry its constructor was handed.
//
// A literal a hop reaches is marked reached, whether or not a literal type already answered, so a whole data-* string
// no site reaches is known. A wide part answers null: it can hold any name.
import type { Expression, Node, NodeArray, PropertyAccessExpression } from "@typescript/native/ast";
import {
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isConditionalExpression,
  isElementAccessExpression,
  isEnumMember,
  isForOfStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
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
  isStringLiteral,
  isTemplateExpression,
  isVariableDeclaration,
  isVariableDeclarationList,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import { sameNode } from "./roles.ts";
import type { GraphState } from "./state.ts";

/** A text a string expression can take; `open` when a span past it is wide, so the text is only a head. */
export interface Text {
  readonly text: string;
  readonly open: boolean;
}

/** What an expression can hold, or null when the checker holds it only as a wide type. */
export type Texts = readonly Text[] | null;

// One step into a value: any element of a list, one index of a tuple, one property, the value of a Map's entries, or
// the value of any property of an object.
type Step =
  | { readonly kind: "element" }
  | { readonly kind: "index"; readonly at: number }
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "map-value" }
  | { readonly kind: "value" };
type Path = readonly Step[];

const ELEMENT: Step = { kind: "element" };
const VALUE: Step = { kind: "value" };
// A Map entry is a `[key, value]` pair.
const ENTRY_VALUE: Step = { kind: "index", at: 1 };
// A hop is one declaration, call or caller followed; a chain longer than this is a cycle or a hand-off no table holds.
const MAX_HOPS = 16;
// A path longer than this walks a structure no hook table has.
const MAX_PATH = 6;
// A template whose spans multiply past this many texts is a computed name, not a table of them.
const MAX_TEXTS = 64;
const MAP = "Map";
const GET = "get";
const OBJECT = "Object";
/** The `Object` statics that list an object's property values: `entries` as the second of each pair. */
const OBJECT_VALUES: ReadonlyMap<string, Path> = new Map([
  ["entries", [ELEMENT, { kind: "index", at: 1 }]],
  ["values", [ELEMENT]],
]);
/** The browser-driver methods that run their first argument in the page and hand it their second as its last
 *  parameter: Playwright's page and locator `evaluate` family. */
const IN_PAGE: ReadonlySet<string> = new Set(["evaluate", "evaluateAll", "evaluateHandle", "$eval", "$$eval", "waitForFunction", "addInitScript"]);
/** The list methods whose callback is handed each element of the receiver as its first parameter. */
const ELEMENT_CALLBACKS: ReadonlySet<string> = new Set(["map", "flatMap", "forEach", "filter", "find", "findLast", "findIndex", "some", "every"]);
/** The list methods that return a list of the receiver's own elements. */
const SAME_ELEMENTS: ReadonlySet<string> = new Set(["filter", "slice", "toSorted", "toReversed", "sort", "reverse", "concat"]);
/** The list methods that return one of the receiver's elements. */
const ONE_ELEMENT: ReadonlySet<string> = new Set(["find", "findLast", "at"]);

type FunctionLike = Node & { readonly parameters: NodeArray<Node>; readonly body?: Node | undefined };

const isFunctionLike = (node: Node): node is FunctionLike =>
  isFunctionDeclaration(node) || isMethodDeclaration(node) || isArrowFunction(node) || isFunctionExpression(node);

const keyOf = (state: GraphState, node: Node): string => `${state.world.fileOfSource(node.getSourceFile())}:${String(node.pos)}`;

// The text of a name a property, binding or key spells, when it is a plain one.
function nameText(node: Node | undefined): string | null {
  if (node !== undefined && (isIdentifier(node) || isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node))) {
    return node.text;
  }
  return null;
}

// The name of the variable whose object literal holds a function as a property's value.
function recordHolder(fn: FunctionLike): Node | undefined {
  if (!isPropertyAssignment(fn.parent)) {
    return undefined;
  }
  let at: Node = fn.parent.parent;
  while (isAsExpression(at.parent) || isSatisfiesExpression(at.parent) || isParenthesizedExpression(at.parent)) {
    at = at.parent;
  }
  return isVariableDeclaration(at.parent) && isIdentifier(at.parent.name) ? at.parent.name : undefined;
}

// The value an in-page callback is handed: the driver call's second argument.
function inPageArgument(fn: FunctionLike): Expression | undefined {
  const call = fn.parent;
  if (isCallExpression(call) && isPropertyAccessExpression(call.expression) && IN_PAGE.has(call.expression.name.text) && sameNode(call.arguments[0], fn)) {
    return call.arguments[1];
  }
  return undefined;
}

// The list a callback is handed the elements of, when it is the first argument of a list method.
function callbackReceiver(fn: FunctionLike): Expression | undefined {
  const call = fn.parent;
  if (
    isCallExpression(call) &&
    isPropertyAccessExpression(call.expression) &&
    ELEMENT_CALLBACKS.has(call.expression.name.text) &&
    sameNode(call.arguments[0], fn)
  ) {
    return call.expression.expression;
  }
  return undefined;
}

// The union of several answers: null when any is wide, since a wide part can hold any name. No answers is no texts:
// an empty list, or a branch that returns none.
function union(parts: readonly Texts[]): Texts {
  if (parts.some((part) => part === null)) {
    return null;
  }
  const seen = new Map<string, Text>();
  for (const text of parts.flatMap((part) => part ?? [])) {
    seen.set(`${String(text.open)}:${text.text}`, text);
  }
  return [...seen.values()];
}

// The expressions a function returns: a concise body, or each return its own body holds outside nested functions.
function returnsOf(fn: FunctionLike): readonly Expression[] {
  if (isArrowFunction(fn) && !isBlock(fn.body)) {
    return [fn.body];
  }
  const { body } = fn;
  if (body === undefined) {
    return [];
  }
  const out: Expression[] = [];
  const visit = (node: Node): void => {
    if (isFunctionLike(node)) {
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

/** The texts the expressions of one world can take, and the literals the asks reached. */
export class HeldTexts {
  readonly #state: GraphState;
  readonly #reached = new Set<string>();

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** Whether an ask reached this literal. */
  reached(node: Node): boolean {
    return this.#reached.has(keyOf(this.#state, node));
  }

  /** The texts `node` can take. */
  *texts(node: Node): APIRequestGenerator<Texts> {
    return yield* this.#at(node, [], 0);
  }

  /** The texts any element of the list `node` holds; a shorthand property asks the binding it names. */
  *elements(node: Node): APIRequestGenerator<Texts> {
    if (isShorthandPropertyAssignment(node)) {
      return yield* this.#symbol(yield* this.#state.world.checker.getShorthandAssignmentValueSymbol.gen(node), [ELEMENT], 0);
    }
    return yield* this.#at(node, [ELEMENT], 0);
  }

  *#at(node: Node, path: Path, hops: number): APIRequestGenerator<Texts> {
    if (isParenthesizedExpression(node) || isAsExpression(node) || isSatisfiesExpression(node) || isNonNullExpression(node)) {
      return yield* this.#at(node.expression, path, hops);
    }
    if (isConditionalExpression(node)) {
      return union([yield* this.#at(node.whenTrue, path, hops), yield* this.#at(node.whenFalse, path, hops)]);
    }
    if (isBinaryExpression(node) && (node.operatorToken.kind === SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === SyntaxKind.BarBarToken)) {
      return union([yield* this.#at(node.left, path, hops), yield* this.#at(node.right, path, hops)]);
    }
    if (path.length === 0) {
      return yield* this.#whole(node, hops);
    }
    if (path.length > MAX_PATH) {
      return null;
    }
    if (isArrayLiteralExpression(node)) {
      return yield* this.#inList(node.elements, path, hops);
    }
    if (isObjectLiteralExpression(node)) {
      return yield* this.#inObject(node.properties, path, hops);
    }
    if (isNewExpression(node) && isIdentifier(node.expression) && node.expression.text === MAP && path[0]?.kind === "map-value") {
      const [entries] = node.arguments ?? [];
      return entries === undefined ? null : yield* this.#at(entries, [ELEMENT, ENTRY_VALUE, ...path.slice(1)], hops);
    }
    return yield* this.#follow(node, path, hops);
  }

  // A value asked for whole: a literal, a template, a literal type, else what its declarations hold. The declarations
  // are walked even when the type answered, so the literals they hold are reached.
  *#whole(node: Node, hops: number): APIRequestGenerator<Texts> {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      this.#reached.add(keyOf(this.#state, node));
      return [{ text: node.text, open: false }];
    }
    if (isTemplateExpression(node)) {
      return yield* this.#template(node.head.text, node.templateSpans, hops);
    }
    const { checker } = this.#state.world;
    const typed = yield* this.#state.literalValues(yield* checker.getTypeAtLocation.gen(node));
    const held = yield* this.#follow(node, [], hops);
    return typed === null ? held : typed.map((text) => ({ text, open: false }));
  }

  *#template(
    head: string,
    spans: readonly { readonly expression: Expression; readonly literal: { readonly text: string } }[],
    hops: number,
  ): APIRequestGenerator<Texts> {
    let texts: Text[] = [{ text: head, open: false }];
    for (const span of spans) {
      const parts = yield* this.#at(span.expression, [], hops);
      if (parts === null || parts.length * texts.length > MAX_TEXTS) {
        return texts.map(({ text }) => ({ text, open: true }));
      }
      texts = texts.flatMap((start) =>
        start.open ? [start] : parts.map((part) => ({ text: `${start.text}${part.text}${part.open ? "" : span.literal.text}`, open: part.open })),
      );
    }
    return texts;
  }

  *#inList(elements: readonly Node[], [step, ...rest]: Path, hops: number): APIRequestGenerator<Texts> {
    if (step?.kind === "index") {
      const before = elements.slice(0, step.at + 1);
      const element = elements[step.at];
      return element === undefined || before.some(isSpreadElement) ? null : yield* this.#at(element, rest, hops);
    }
    if (step?.kind !== "element") {
      return null;
    }
    const found: Texts[] = [];
    for (const element of elements) {
      found.push(isSpreadElement(element) ? yield* this.#at(element.expression, [ELEMENT, ...rest], hops) : yield* this.#at(element, rest, hops));
    }
    return union(found);
  }

  // A property of an object literal: its own assignment, a shorthand's value, else the spreads that may carry it.
  *#inObject(properties: readonly Node[], [step, ...rest]: Path, hops: number): APIRequestGenerator<Texts> {
    if (step?.kind === "value") {
      return yield* this.#everyValue(properties, rest, hops);
    }
    if (step?.kind !== "property") {
      return null;
    }
    for (const property of properties.toReversed()) {
      if (isPropertyAssignment(property) && nameText(property.name) === step.name) {
        return yield* this.#at(property.initializer, rest, hops);
      }
      if (isShorthandPropertyAssignment(property) && nameText(property.name) === step.name) {
        const symbol = yield* this.#state.world.checker.getShorthandAssignmentValueSymbol.gen(property);
        return yield* this.#symbol(symbol, rest, hops);
      }
    }
    const spreads = properties.filter(isSpreadAssignment);
    const found: Texts[] = [];
    for (const spread of spreads) {
      found.push(yield* this.#at(spread.expression, [step, ...rest], hops));
    }
    return union(found);
  }

  // Any property's value: each assignment, each shorthand's value and each spread's values.
  *#everyValue(properties: readonly Node[], rest: Path, hops: number): APIRequestGenerator<Texts> {
    const found: Texts[] = [];
    for (const property of properties) {
      if (isPropertyAssignment(property)) {
        found.push(yield* this.#at(property.initializer, rest, hops));
      } else if (isShorthandPropertyAssignment(property)) {
        found.push(yield* this.#symbol(yield* this.#state.world.checker.getShorthandAssignmentValueSymbol.gen(property), rest, hops));
      } else if (isSpreadAssignment(property)) {
        found.push(yield* this.#at(property.expression, [VALUE, ...rest], hops));
      } else {
        // A method or an accessor holds a value only a call computes.
        return null;
      }
    }
    return union(found);
  }

  // A name, a member or a call: its symbol's declarations, a member's object when no declaration holds a value, a
  // call's returns.
  *#follow(node: Node, path: Path, hops: number): APIRequestGenerator<Texts> {
    if (hops >= MAX_HOPS) {
      return null;
    }
    if (isCallExpression(node)) {
      return yield* this.#call(node, path, hops + 1);
    }
    if (!(isIdentifier(node) || isPropertyAccessExpression(node) || isElementAccessExpression(node))) {
      return null;
    }
    const symbol = yield* this.#unalias(yield* this.#state.world.checker.getSymbolAtLocation.gen(node));
    const held = yield* this.#symbol(symbol, path, hops + 1);
    if (held !== null || isIdentifier(node)) {
      return held;
    }
    if (isPropertyAccessExpression(node)) {
      return yield* this.#at(node.expression, [{ kind: "property", name: node.name.text }, ...path], hops + 1);
    }
    const index = node.argumentExpression;
    let step: Step = ELEMENT;
    if (isNumericLiteral(index)) {
      step = { kind: "index", at: Number(index.text) };
    } else if (isStringLiteral(index)) {
      step = { kind: "property", name: index.text };
    }
    return yield* this.#at(node.expression, [step, ...path], hops + 1);
  }

  *#symbol(symbol: NativeSymbol | undefined, path: Path, hops: number): APIRequestGenerator<Texts> {
    if (symbol === undefined || symbol.declarations.length === 0) {
      return null;
    }
    const found: Texts[] = [];
    for (const handle of symbol.declarations) {
      if (this.#state.world.fileOf(handle) === null) {
        return null;
      }
      const declaration = yield* handle.resolve.gen();
      found.push(declaration === undefined ? null : yield* this.#declared(declaration, path, hops));
    }
    return union(found);
  }

  *#declared(declaration: Node, path: Path, hops: number): APIRequestGenerator<Texts> {
    if (isVariableDeclaration(declaration) && isVariableDeclarationList(declaration.parent) && isForOfStatement(declaration.parent.parent)) {
      return yield* this.#at(declaration.parent.parent.expression, [ELEMENT, ...path], hops);
    }
    if ((isVariableDeclaration(declaration) || isPropertyAssignment(declaration) || isEnumMember(declaration)) && declaration.initializer !== undefined) {
      return yield* this.#at(declaration.initializer, path, hops);
    }
    if (isParameterDeclaration(declaration)) {
      return yield* this.#parameter(declaration, path, hops);
    }
    if (isBindingElement(declaration)) {
      return yield* this.#binding(declaration, path, hops);
    }
    return null;
  }

  // A destructured binding holds the value at its place in what the pattern destructures.
  *#binding(
    element: Node & { readonly parent: Node; readonly propertyName?: Node | undefined; readonly name?: Node | undefined },
    path: Path,
    hops: number,
  ): APIRequestGenerator<Texts> {
    const pattern = element.parent;
    let step: Step;
    if (isArrayBindingPattern(pattern)) {
      step = { kind: "index", at: pattern.elements.findIndex((candidate) => sameNode(candidate, element)) };
    } else {
      const name = nameText(element.propertyName ?? element.name);
      if (name === null) {
        return null;
      }
      step = { kind: "property", name };
    }
    const holder = pattern.parent;
    return yield* this.#declared(holder, [step, ...path], hops);
  }

  // A parameter holds its default and what each caller hands it at its index; a list method's callback is handed
  // each element of the receiver.
  *#parameter(
    parameter: Node & { readonly parent: Node; readonly initializer?: Expression | undefined },
    path: Path,
    hops: number,
  ): APIRequestGenerator<Texts> {
    const fn = parameter.parent;
    if (!isFunctionLike(fn)) {
      return null;
    }
    const index = fn.parameters.findIndex((candidate) => sameNode(candidate, parameter));
    const found: Texts[] = parameter.initializer === undefined ? [] : [yield* this.#at(parameter.initializer, path, hops)];
    const handed = inPageArgument(fn);
    if (handed !== undefined) {
      return index === fn.parameters.length - 1 ? union([...found, yield* this.#at(handed, path, hops)]) : null;
    }
    const receiver = callbackReceiver(fn);
    if (receiver !== undefined) {
      return index === 0 ? union([...found, yield* this.#at(receiver, [ELEMENT, ...path], hops)]) : null;
    }
    const held = [...found, ...(yield* this.#arguments(fn, index, path, hops))];
    // A parameter no caller hands a value and with no default holds what an outside caller passes.
    return held.length === 0 ? null : union(held);
  }

  *#arguments(fn: FunctionLike, index: number, path: Path, hops: number): APIRequestGenerator<readonly Texts[]> {
    // A function held by a variable or a property is called through that holder.
    const target = (isArrowFunction(fn) || isFunctionExpression(fn)) && (isVariableDeclaration(fn.parent) || isPropertyAssignment(fn.parent)) ? fn.parent : fn;
    const found: Texts[] = [];
    for (const usage of yield* this.#state.world.signatureUsage(target)) {
      const caller = usage.call === undefined ? undefined : yield* usage.call.resolve.gen();
      // The declaration's own name is listed among its usages; it hands the function nothing.
      if (caller === undefined && sameNode((yield* usage.name.resolve.gen())?.parent, target)) {
        continue;
      }
      const argument = caller !== undefined && isCallExpression(caller) ? caller.arguments[index] : undefined;
      found.push(argument === undefined ? null : yield* this.#at(argument, path, hops));
    }
    return [...found, ...(yield* this.#recordCalls(fn, index, path, hops))];
  }

  // A function a record holds by key is also called through the record by a computed key (`READERS[kind](...)`), a
  // call no reference to the property names: each such call on the record's holder hands it its arguments.
  *#recordCalls(fn: FunctionLike, index: number, path: Path, hops: number): APIRequestGenerator<readonly Texts[]> {
    const holder = recordHolder(fn);
    if (holder === undefined) {
      return [];
    }
    const { world } = this.#state;
    const groups = yield* world.referencedSymbolsOf(holder);
    const found: Texts[] = [];
    for (const handle of groups.flatMap((group) => group.references)) {
      const reference = world.fileOf(handle) === null ? undefined : yield* handle.resolve.gen();
      const access = reference?.parent;
      const call = access?.parent;
      if (
        access !== undefined &&
        isElementAccessExpression(access) &&
        sameNode(access.expression, reference) &&
        call !== undefined &&
        isCallExpression(call) &&
        sameNode(call.expression, access)
      ) {
        const argument = call.arguments[index];
        found.push(argument === undefined ? null : yield* this.#at(argument, path, hops));
      }
    }
    return found;
  }

  // A call: a list method carries the path through its receiver or its callback's returns, a Map's `get` asks the
  // values of the Map, any other call its callee's returns.
  *#call(
    call: Expression & { readonly expression: Expression; readonly arguments: NodeArray<Expression> },
    path: Path,
    hops: number,
  ): APIRequestGenerator<Texts> {
    const callee = call.expression;
    if (isPropertyAccessExpression(callee)) {
      const listed = yield* this.#listCall(callee, call.arguments[0], path, hops);
      if (listed !== undefined) {
        return listed;
      }
    }
    return yield* this.#returns(callee, path, hops);
  }

  // A list method's answer, or undefined when the method is none of them or a `get` finds no Map.
  *#listCall(callee: PropertyAccessExpression, callback: Expression | undefined, path: Path, hops: number): APIRequestGenerator<Texts | undefined> {
    const method = callee.name.text;
    const receiver = callee.expression;
    const values = isIdentifier(receiver) && receiver.text === OBJECT ? OBJECT_VALUES.get(method) : undefined;
    if (values !== undefined) {
      return yield* this.#objectValues(values, callback, path, hops);
    }
    if (method === "map" || method === "flatMap") {
      return yield* this.#mapped(callback, method === "map" ? path.slice(1) : path, path[0]?.kind === "element", hops);
    }
    if (SAME_ELEMENTS.has(method)) {
      return yield* this.#at(receiver, path, hops);
    }
    if (ONE_ELEMENT.has(method)) {
      return yield* this.#at(receiver, [ELEMENT, ...path], hops);
    }
    if (method === GET) {
      return (yield* this.#at(receiver, [{ kind: "map-value" }, ...path], hops)) ?? undefined;
    }
    return undefined;
  }

  // An `Object.entries` or `Object.values` list holds the object's property values where the path asks for one.
  *#objectValues(values: Path, object: Expression | undefined, path: Path, hops: number): APIRequestGenerator<Texts> {
    const asksValue = values.every((step, index) => {
      const asked = path[index];
      return asked !== undefined && asked.kind === step.kind && (step.kind !== "index" || (asked.kind === "index" && asked.at === step.at));
    });
    return object === undefined || !asksValue ? null : yield* this.#at(object, [VALUE, ...path.slice(values.length)], hops);
  }

  *#returns(callee: Expression, path: Path, hops: number): APIRequestGenerator<Texts> {
    const symbol = yield* this.#unalias(yield* this.#state.world.checker.getSymbolAtLocation.gen(callee));
    if (symbol === undefined || symbol.declarations.length === 0) {
      return null;
    }
    const found: Texts[] = [];
    for (const handle of symbol.declarations) {
      const declaration = this.#state.world.fileOf(handle) === null ? undefined : yield* handle.resolve.gen();
      const fn = declaration !== undefined && isVariableDeclaration(declaration) ? declaration.initializer : declaration;
      // A signature with no body (an overload, a declaration) returns what its implementation does, which it does not show.
      if (fn === undefined || !isFunctionLike(fn) || fn.body === undefined) {
        return null;
      }
      for (const returned of returnsOf(fn)) {
        found.push(yield* this.#at(returned, path, hops));
      }
    }
    return union(found);
  }

  // A list built by `map` or `flatMap` holds its callback's returns at the rest of the path.
  *#mapped(callback: Expression | undefined, rest: Path, element: boolean, hops: number): APIRequestGenerator<Texts> {
    if (!element || callback === undefined || !isFunctionLike(callback)) {
      return null;
    }
    const found: Texts[] = [];
    for (const returned of returnsOf(callback)) {
      found.push(yield* this.#at(returned, rest, hops));
    }
    return union(found);
  }

  *#unalias(symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
    if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
      return symbol;
    }
    return yield* this.#state.world.checker.getAliasedSymbol.gen(symbol);
  }
}
