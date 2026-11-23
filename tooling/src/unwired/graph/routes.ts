// Route path parameters: a Hono route's `:name` segments pair with the `c.req.param("name")` reads in its handlers, and a
// segment no handler reads is reported. Hono reads a parameter by its string, so no reference ties the two.
//
// Invariants:
// - A route and a parameter read are recognised by their resolved declaration in the hono package, never by the text at
//   the site: a local `get` or `param` is neither.
// - A path's segments are read from its literal, or from a template's literal parts and each substitution's literal
//   type (`${PREFIX}/:${ID_PARAM}`); a substitution of a wide type names no segment.
// - A handler is a function literal or one of our functions it names; a read's key is its literal or each literal its
//   type can be. A handler that reads params whole (`c.req.param()`), hands its context on, or that the walk cannot
//   see into reads every segment, so the report never names a segment a handler might read.
import type { ArrowFunction, CallExpression, FunctionDeclaration, FunctionExpression, Node } from "@typescript/native/ast";
import {
  isArrowFunction,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isNoSubstitutionTemplateLiteral,
  isPropertyAccessExpression,
  isStringLiteral,
  isTemplateExpression,
  isVariableDeclaration,
} from "@typescript/native/ast";
import { keyLiterals, ROUTE_METHODS } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { literalValues } from "./state.ts";

const HONO = "hono";
const PARAM_METHOD = "param";
const SEGMENT = /:([A-Za-z_]\w*)/gu;
// Stands for a substitution of a wide type, so no segment is read across it.
const WIDE = "/";

type Handler = ArrowFunction | FunctionExpression | FunctionDeclaration;

// Every path a template can spell: its literal parts around each substitution's literal values.
function pathTexts(state: GraphState, path: Node): readonly string[] {
  if (isStringLiteral(path) || isNoSubstitutionTemplateLiteral(path)) {
    return [path.text];
  }
  if (!isTemplateExpression(path)) {
    return [];
  }
  const values = state.batch(state.world.typesAt(path.templateSpans.map(({ expression }) => expression)).map((type) => literalValues(type)));
  let texts = [path.head.text];
  for (const [at, span] of path.templateSpans.entries()) {
    const choices = values[at] ?? [WIDE];
    texts = texts.flatMap((text) => choices.map((choice) => `${text}${choice}${span.literal.text}`));
  }
  return texts;
}

const segmentsOf = (texts: readonly string[]): readonly string[] => [
  ...new Set(texts.flatMap((text) => [...text.matchAll(SEGMENT)].map((match) => match[1] ?? ""))),
];

export class RouteParams {
  readonly #state: GraphState;

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** Pair each hono route a file registers with its handlers' parameter reads. */
  file(calls: readonly CallExpression[], file: string): void {
    const routes = this.#hono(calls);
    for (const call of routes) {
      this.#route(call, file);
    }
  }

  // The calls whose resolved signature hono declares.
  #hono(calls: readonly CallExpression[]): readonly CallExpression[] {
    const state = this.#state;
    const signatures = state.batch(calls.map((call) => state.world.checker.getResolvedSignature.gen(call)));
    const ours = state.world.fromPackage(
      signatures.map((signature) => (signature.declaration === undefined ? [] : [signature.declaration])),
      HONO,
    );
    return calls.filter((_, at) => ours[at] === true);
  }

  #route(call: CallExpression, file: string): void {
    const method = isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
    const index = method === undefined ? undefined : ROUTE_METHODS.get(method);
    const path = index === undefined ? undefined : call.arguments[index];
    if (index === undefined || path === undefined) {
      return;
    }
    const segments = segmentsOf(pathTexts(this.#state, path));
    if (segments.length === 0) {
      return;
    }
    const read = this.#reads(call.arguments.slice(index + 1));
    if (read === "whole") {
      return;
    }
    const source = call.getSourceFile();
    const line = source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1;
    const spelled = source.text.slice(path.getStart(source), path.end);
    for (const param of segments.filter((segment) => !read.has(segment))) {
      this.#state.unreadRouteParams.push({ file, line, path: spelled, param });
    }
  }

  // The parameter names a route's handlers read, or "whole" when one may read any.
  #reads(handlers: readonly Node[]): ReadonlySet<string> | "whole" {
    const names = new Set<string>();
    for (const handler of handlers) {
      const fn = this.#handlerFunction(handler);
      const found = fn === null ? "whole" : this.#functionReads(fn);
      if (found === "whole") {
        return "whole";
      }
      for (const name of found) {
        names.add(name);
      }
    }
    return names;
  }

  // A function literal, or our own function an identifier names; null for anything the walk cannot see into.
  #handlerFunction(handler: Node): Handler | null {
    if (isArrowFunction(handler) || isFunctionExpression(handler)) {
      return handler;
    }
    if (!isIdentifier(handler)) {
      return null;
    }
    const state = this.#state;
    const [symbol] = state.batch([state.world.checker.getSymbolAtLocation.gen(handler)]);
    const handle = symbol?.declarations.find((declaration) => state.resolver.ours(declaration));
    const [node] = handle === undefined ? [] : state.batch([handle.resolve.gen()]);
    const fn = node !== undefined && isVariableDeclaration(node) ? node.initializer : node;
    return fn !== undefined && (isFunctionDeclaration(fn) || isArrowFunction(fn) || isFunctionExpression(fn)) ? fn : null;
  }

  #functionReads(fn: Handler): ReadonlySet<string> | "whole" {
    const [context] = fn.parameters;
    const contextName = context !== undefined && isIdentifier(context.name) ? context.name.text : null;
    const params: CallExpression[] = [];
    let whole = contextName === null;
    const visit = (node: Node): void => {
      if (isCallExpression(node)) {
        if (isPropertyAccessExpression(node.expression) && node.expression.name.text === PARAM_METHOD) {
          params.push(node);
        } else if (node.arguments.some((argument) => isIdentifier(argument) && argument.text === contextName)) {
          // the context goes to code this pass does not follow, which may read any parameter
          whole = true;
        }
      }
      node.forEachChild(visit);
    };
    if (fn.body === undefined) {
      return "whole";
    }
    visit(fn.body);
    if (whole) {
      return "whole";
    }
    return this.#paramKeys(this.#hono(params));
  }

  #paramKeys(reads: readonly CallExpression[]): ReadonlySet<string> | "whole" {
    const state = this.#state;
    const names = new Set<string>();
    const typed = state.batch(state.world.typesAt(reads.map((read) => read.arguments[0] ?? read)).map((type) => literalValues(type)));
    for (const [at, read] of reads.entries()) {
      const [key] = read.arguments;
      const found = key === undefined ? null : (keyLiterals(key) ?? typed[at] ?? null);
      if (found === null) {
        return "whole";
      }
      for (const name of found) {
        names.add(name);
      }
    }
    return names;
  }
}
