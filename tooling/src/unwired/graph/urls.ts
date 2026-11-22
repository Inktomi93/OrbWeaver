// The URLs the tree requests and the routes they can reach, read off the merged program the graph session holds. A URL
// folds through the checker to segment patterns: literals, templates, constants, unions of literal types and in-tree URL
// builders. A request is one the platform sends: `fetch`, a navigation, a beacon, an event stream, or a URL member the
// platform declares, written by assignment, JSX attribute or object key. A call to an in-tree function that returns one
// of our URLs is a request too.
import type {
  CallExpression,
  Expression,
  Identifier,
  NewExpression,
  Node,
  ShorthandPropertyAssignment,
  SourceFile,
  TemplateExpression,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isClassDeclaration,
  isConditionalExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isJsxAttribute,
  isMethodDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSourceFile,
  isStringLiteral,
  isTemplateExpression,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SymbolFlags } from "@typescript/native/sync";
import type { Site } from "../classify.ts";
import type { NativeWorld } from "../native.ts";
import { declarationKeys, hasFlag, isFunctionLike, propertiesNamed } from "../native.ts";
import { isProduction } from "../worlds.ts";

export const ROUTE_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "ALL"] as const;
/** A request method, or `ALL` for a route that takes every method and for a caller whose method the scan cannot read. */
export type RouteMethod = (typeof ROUTE_METHODS)[number];
export const ANY_METHOD: RouteMethod = "ALL";
const DEFAULT_METHOD: RouteMethod = "GET";

/** A platform request API: which argument holds the URL, the method it sends, or the argument whose
 *  `RequestInit.method` names it, and the argument that carries a body, when it sends one. */
interface RequestCall {
  readonly url: number;
  readonly method: RouteMethod | { readonly init: number };
  readonly body: number | null;
}
// Keyed by the lib's symbol: `Owner.member` for a member, a global function or constructor's own name otherwise.
const REQUEST_CALLS: Readonly<Record<string, RequestCall>> = {
  fetch: { url: 0, method: { init: 1 }, body: 1 },
  // biome-ignore lint/style/useNamingConvention: the key is the lib's own `Request` constructor.
  Request: { url: 0, method: { init: 1 }, body: 1 },
  // biome-ignore lint/style/useNamingConvention: the key is the lib's own `EventSource` constructor.
  EventSource: { url: 0, method: "GET", body: null },
  // biome-ignore lint/style/useNamingConvention: the key is the lib's own `WebSocket` constructor.
  WebSocket: { url: 0, method: "GET", body: null },
  open: { url: 0, method: "GET", body: null },
  "Window.open": { url: 0, method: "GET", body: null },
  "Location.assign": { url: 0, method: "GET", body: null },
  "Location.replace": { url: 0, method: "GET", body: null },
  "Navigator.sendBeacon": { url: 0, method: "POST", body: 1 },
};
const REQUEST_NAMES: ReadonlySet<string> = new Set(Object.keys(REQUEST_CALLS).map((key) => key.slice(key.lastIndexOf(".") + 1)));
// RequestInit's method member, read from an init the platform's own request call types.
const INIT_METHOD = "method";

// URL members the platform declares: writing one loads it. A form's action posts with a method the form owns.
const URL_MEMBERS: Readonly<Record<string, RouteMethod>> = { href: "GET", src: "GET", action: ANY_METHOD, formAction: ANY_METHOD };

// --- URL patterns -------------------------------------------------------------------------------------------------

/** A folded string: literal text, with `null` where the checker gives no literal. */
export type Pattern = readonly (string | null)[];
const UNKNOWN: readonly Pattern[] = [[null]];
// A fold past this many alternatives says nothing a wildcard does not.
const MAX_PATTERNS = 16;
// How many constants, builders and branches a fold follows from the site it starts at.
export const FOLD_DEPTH = 6;

function cross(lists: readonly (readonly Pattern[])[]): readonly Pattern[] {
  let out: readonly Pattern[] = [[]];
  for (const list of lists) {
    out = out.flatMap((head) => list.map((tail) => [...head, ...tail]));
    if (out.length > MAX_PATTERNS) {
      return UNKNOWN;
    }
  }
  return out;
}

export function unwrap(node: Expression): Expression {
  let at = node;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at) || isNonNullExpression(at)) {
    at = at.expression;
  }
  return at;
}

// The name a callee or a value reads: an identifier, or a property access's member.
function nameOf(expression: Expression): Identifier | null {
  if (isIdentifier(expression)) {
    return expression;
  }
  if (isPropertyAccessExpression(expression) && isIdentifier(expression.name)) {
    return expression.name;
  }
  return null;
}

export function* literalsOf(type: Type): APIRequestGenerator<readonly Pattern[] | null> {
  if (type.isStringLiteralType()) {
    return [[type.value]];
  }
  if (!type.isUnionType()) {
    return null;
  }
  const parts = yield* type.getTypes.gen();
  return parts.length <= MAX_PATTERNS && parts.every((part) => part.isStringLiteralType()) ? parts.map((part) => [part.value]) : null;
}

function* unaliased(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  return symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) ? yield* world.checker.getAliasedSymbol.gen(symbol) : symbol;
}

const outsideTree = (world: NativeWorld, symbol: NativeSymbol | undefined): boolean =>
  symbol !== undefined && symbol.declarations.length > 0 && symbol.declarations.every((handle) => world.fileOf(handle) === null);

// The in-tree node a symbol is declared by, when it has one declaration in the world's files.
function* declarationOf(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<Node | undefined> {
  const [handle, ...more] = symbol?.declarations ?? [];
  return handle === undefined || more.length > 0 || world.fileOf(handle) === null ? undefined : yield* handle.resolve.gen();
}

// The expressions a function returns, not counting nested functions' returns.
function returnsOf(fn: Node): readonly Expression[] {
  if (isArrowFunction(fn) && !isBlockBody(fn.body)) {
    return [fn.body as Expression];
  }
  const found: Expression[] = [];
  const visit = (node: Node): void => {
    if (isReturnStatement(node) && node.expression !== undefined) {
      found.push(node.expression);
    }
    if (!isFunctionLike(node)) {
      node.forEachChild(visit);
    }
  };
  (fn as { readonly body?: Node }).body?.forEachChild(visit);
  return found;
}

const isBlockBody = (body: Node): boolean => body.kind === SyntaxKind.Block;

// The function a declaration names: itself, or a variable's function initializer.
function functionOf(declaration: Node | undefined): Node | null {
  if (declaration === undefined) {
    return null;
  }
  if ((isFunctionDeclaration(declaration) || isMethodDeclaration(declaration)) && declaration.body !== undefined) {
    return declaration;
  }
  const value = isVariableDeclaration(declaration) && declaration.initializer !== undefined ? unwrap(declaration.initializer) : undefined;
  return value !== undefined && (isArrowFunction(value) || isFunctionExpression(value)) ? value : null;
}

/** Folds an expression to the strings it can be, through the checker. */
export function* fold(world: NativeWorld, node: Expression, depth: number): APIRequestGenerator<readonly Pattern[]> {
  const expression = unwrap(node);
  if (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) {
    return [[expression.text]];
  }
  if (depth > FOLD_DEPTH) {
    return UNKNOWN;
  }
  if (isTemplateExpression(expression)) {
    return yield* foldTemplate(world, expression, depth);
  }
  if (isBinaryExpression(expression)) {
    const kind = expression.operatorToken.kind;
    if (kind === SyntaxKind.PlusToken) {
      return cross(yield* all(fold(world, expression.left, depth + 1), fold(world, expression.right, depth + 1)));
    }
    if (kind === SyntaxKind.QuestionQuestionToken || kind === SyntaxKind.BarBarToken) {
      return (yield* all(fold(world, expression.left, depth + 1), fold(world, expression.right, depth + 1))).flat();
    }
  }
  if (isConditionalExpression(expression)) {
    return (yield* all(fold(world, expression.whenTrue, depth + 1), fold(world, expression.whenFalse, depth + 1))).flat();
  }
  if (isCallExpression(expression)) {
    const called = yield* foldCall(world, expression, depth);
    if (called !== null) {
      return called;
    }
  }
  return yield* foldValue(world, expression, depth);
}

// A value's literal type, else the initializer of the constant or the property it names.
function* foldValue(world: NativeWorld, expression: Expression, depth: number): APIRequestGenerator<readonly Pattern[]> {
  const { checker } = world;
  const literal = yield* literalsOf(yield* checker.getTypeAtLocation.gen(expression));
  if (literal !== null) {
    return literal;
  }
  const named = nameOf(expression);
  if (named === null) {
    return UNKNOWN;
  }
  const declaration = yield* declarationOf(world, yield* unaliased(world, yield* checker.getSymbolAtLocation.gen(named)));
  const initializer =
    declaration !== undefined && (isVariableDeclaration(declaration) || isPropertyAssignment(declaration)) ? declaration.initializer : undefined;
  return initializer === undefined ? UNKNOWN : yield* fold(world, initializer, depth + 1);
}

// A template whose spans read one receiver of a union of object types folds once per member of the union, so two of
// its spans never pair values from different members.
function* foldTemplate(world: NativeWorld, template: TemplateExpression, depth: number): APIRequestGenerator<readonly Pattern[]> {
  const { checker } = world;
  const receivers = template.templateSpans.flatMap((span) => {
    const value = unwrap(span.expression);
    return isPropertyAccessExpression(value) && isIdentifier(value.expression) ? [value.expression] : [];
  });
  const shared = receivers.find((receiver, at) => receivers.findIndex((other) => other.text === receiver.text) !== at);
  const receiverType = shared === undefined ? undefined : yield* checker.getTypeAtLocation.gen(shared);
  const members = receiverType?.isUnionType() === true ? yield* receiverType.getTypes.gen() : [undefined];
  const folded: Pattern[] = [];
  for (const member of members) {
    const spans = yield* all(
      ...template.templateSpans.map(function* (span): APIRequestGenerator<readonly Pattern[]> {
        const value = unwrap(span.expression);
        const own =
          member !== undefined && isPropertyAccessExpression(value) && isIdentifier(value.expression) && value.expression.text === shared?.text
            ? yield* checker.getPropertyOfType.gen(member, value.name.text)
            : undefined;
        const head =
          own === undefined ? yield* fold(world, span.expression, depth + 1) : ((yield* literalsOf(yield* checker.getTypeOfSymbol.gen(own))) ?? UNKNOWN);
        return cross([head, [[span.literal.text]]]);
      }),
    );
    folded.push(...cross([[[template.head.text]], ...spans]));
  }
  return folded.length > MAX_PATTERNS ? UNKNOWN : folded;
}

// `text.replace(":id", id)` keeps the text with the replaced part as a wildcard; an in-tree function folds to what it
// returns. Null for any other call, whose type is read instead.
function* foldCall(world: NativeWorld, call: CallExpression, depth: number): APIRequestGenerator<readonly Pattern[] | null> {
  const { checker } = world;
  const callee = unwrap(call.expression);
  const name = nameOf(callee);
  if (name === null) {
    return null;
  }
  const symbol = yield* unaliased(world, yield* checker.getSymbolAtLocation.gen(name));
  if (isPropertyAccessExpression(callee) && outsideTree(world, symbol) && (callee.name.text === "replace" || callee.name.text === "replaceAll")) {
    const [target] = call.arguments;
    const receiver = yield* fold(world, callee.expression, depth + 1);
    return target !== undefined && (isStringLiteral(target) || isNoSubstitutionTemplateLiteral(target))
      ? receiver.map((pattern) => replaced(pattern, target.text))
      : receiver;
  }
  const fn = functionOf(yield* declarationOf(world, symbol));
  if (fn === null) {
    return null;
  }
  const returned = yield* all(...returnsOf(fn).map((value) => fold(world, value, depth + 1)));
  return returned.length === 0 ? null : returned.flat();
}

const replaced = (pattern: Pattern, target: string): Pattern =>
  pattern.flatMap((part) =>
    part === null || !part.includes(target) ? [part] : part.split(target).flatMap((piece, at) => (at === 0 ? [piece] : [null, piece])),
  );

/** A path on our origin: one entry per segment, each a run of literal text and wildcards. */
export type CallerPath = readonly Pattern[];

// Adjacent literal parts as one, with no empty part, so a pattern starts with its first real text.
export function merged(pattern: Pattern): Pattern {
  const out: (string | null)[] = [];
  for (const part of pattern) {
    const last = out.at(-1);
    if (part === "") {
      continue;
    }
    if (typeof part === "string" && typeof last === "string") {
      out[out.length - 1] = last + part;
    } else {
      out.push(part);
    }
  }
  return out;
}

/** A folded path as text, each part the fold cannot read as `:*`; `null` when its start is unknown. */
export function patternText(pattern: Pattern): string | null {
  const parts = merged(pattern);
  return typeof parts[0] === "string" ? parts.map((part) => part ?? ":*").join("") : null;
}

// A URL pattern up to its query or fragment.
function withoutQuery(pattern: Pattern): Pattern {
  const cut: (string | null)[] = [];
  for (const part of merged(pattern)) {
    const end = part === null ? -1 : part.search(/[?#]/u);
    if (part === null || end === -1) {
      cut.push(part);
      continue;
    }
    cut.push(part.slice(0, end));
    break;
  }
  return cut;
}

// The path a URL pattern requests, without its query or fragment, or null when it is not a path on our origin.
export function callerPath(pattern: Pattern): CallerPath | null {
  const cut = withoutQuery(pattern);
  const [first] = cut;
  if (typeof first !== "string" || !first.startsWith("/") || first.startsWith("//")) {
    return null;
  }
  const segments: (string | null)[][] = [[]];
  for (const part of cut) {
    const pieces = part === null ? [null] : part.split("/");
    for (const [at, piece] of pieces.entries()) {
      if (at > 0) {
        segments.push([]);
      }
      if (piece !== "") {
        segments.at(-1)?.push(piece);
      }
    }
  }
  return segments.slice(1);
}

export const asMethod = (text: string): RouteMethod => ROUTE_METHODS.find((method) => method === text.toUpperCase()) ?? ANY_METHOD;

/** Each node of each file, parents first. */
export function walkFiles(files: readonly SourceFile[], visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of files) {
    file.forEachChild(step);
  }
}

/** One request the tree sends: where, the method, the paths its URL can be, and the argument that carries its body. */
export interface Request {
  readonly site: Site;
  readonly sink: string;
  readonly method: RouteMethod;
  readonly patterns: readonly Pattern[];
  readonly body: number | null;
}

// A script file's top level, directly or through a `declare var` statement, is the global scope.
const globalScope = (owner: Node): boolean =>
  isSourceFile(owner) || (isVariableDeclarationList(owner) && isVariableStatement(owner.parent) && isSourceFile(owner.parent.parent));

function* requestKey(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<string | null> {
  if (symbol === undefined || !outsideTree(world, symbol)) {
    return null;
  }
  const parent = yield* symbol.getParent.gen();
  if (parent !== undefined) {
    // A module's export keeps its module in the key, so `open` from a file-system module is never the window's.
    return `${parent.name}.${symbol.name}`;
  }
  if (!(hasFlag(symbol.flags, SymbolFlags.Property) || hasFlag(symbol.flags, SymbolFlags.Method))) {
    return symbol.name;
  }
  if (!REQUEST_NAMES.has(symbol.name)) {
    return null;
  }
  return yield* ownerKey(symbol);
}

// A member read through an intersection, such as `window.open` on `Window & typeof globalThis`, has no owner symbol;
// its declarations name the owners. A global declaration among them makes it the global's sink, so `window.open`,
// `self.open` and `globalThis.open` are one sink; a mapped type's property has no owner and is no sink.
function* ownerKey(symbol: NativeSymbol): APIRequestGenerator<string | null> {
  const keys: string[] = [];
  for (const handle of symbol.declarations) {
    // A handle the program cannot resolve names no owner.
    const owner = (yield* handle.resolve.gen())?.parent;
    if (owner === undefined) {
      continue;
    }
    if (globalScope(owner)) {
      return symbol.name;
    }
    if ((isInterfaceDeclaration(owner) || isClassDeclaration(owner)) && owner.name !== undefined) {
      keys.push(`${owner.name.text}.${symbol.name}`);
    }
  }
  return keys.find((key) => key in REQUEST_CALLS) ?? null;
}

// A shorthand's own symbol is the member; the value it reads is the variable it names.
function* shorthandValue(world: NativeWorld, shorthand: ShorthandPropertyAssignment): APIRequestGenerator<readonly Pattern[]> {
  const { checker } = world;
  const value = yield* checker.getShorthandAssignmentValueSymbol.gen(shorthand);
  const literal = value === undefined ? null : yield* literalsOf(yield* checker.getTypeOfSymbol.gen(value));
  if (literal !== null) {
    return literal;
  }
  const bound = yield* declarationOf(world, value);
  return bound !== undefined && isVariableDeclaration(bound) && bound.initializer !== undefined ? yield* fold(world, bound.initializer, 0) : UNKNOWN;
}

// The method a request's init object names, read through the checker as the platform's `RequestInit` reads it: a
// plain, shorthand, quoted or spread member alike. A method the fold cannot read is every method.
function* initMethod(world: NativeWorld, init: Expression | undefined): APIRequestGenerator<RouteMethod> {
  if (init === undefined) {
    return DEFAULT_METHOD;
  }
  const { checker } = world;
  const member = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(init), INIT_METHOD);
  if (member === undefined) {
    return DEFAULT_METHOD;
  }
  const declaration = yield* declarationOf(world, member);
  let patterns = (yield* literalsOf(yield* checker.getTypeOfSymbol.gen(member))) ?? UNKNOWN;
  if (declaration !== undefined && isPropertyAssignment(declaration)) {
    patterns = yield* fold(world, declaration.initializer, 0);
  } else if (declaration !== undefined && isShorthandPropertyAssignment(declaration)) {
    patterns = yield* shorthandValue(world, declaration);
  }
  const [only] = patterns;
  return patterns.length === 1 && only !== undefined && !only.includes(null) ? asMethod(only.join("")) : ANY_METHOD;
}

/** The request a platform call sends, its URL folded to the paths it can be; `null` for any other call. */
export function* platformCall(world: NativeWorld, call: CallExpression | NewExpression): APIRequestGenerator<Request | null> {
  const callee = unwrap(call.expression);
  const name = nameOf(callee);
  if (name === null) {
    return null;
  }
  const key = yield* requestKey(world, yield* unaliased(world, yield* world.checker.getSymbolAtLocation.gen(name)));
  const shape = key === null ? undefined : REQUEST_CALLS[key];
  const args = call.arguments ?? [];
  const url = shape === undefined ? undefined : args[shape.url];
  if (shape === undefined || url === undefined || key === null) {
    return null;
  }
  const method = typeof shape.method === "string" ? shape.method : yield* initMethod(world, args[shape.method.init]);
  return { site: world.siteOf(call), sink: key, method, patterns: yield* fold(world, url, 0), body: shape.body };
}

// A write of a URL member the platform declares: an assignment, a JSX attribute or an object literal key.
function* memberWrite(world: NativeWorld, name: Identifier, value: Expression, resolved: readonly NativeSymbol[]): APIRequestGenerator<Request | null> {
  const { text } = name;
  if (resolved.length === 0 || !resolved.every((member) => outsideTree(world, member))) {
    return null;
  }
  return { site: world.siteOf(name), sink: text, method: URL_MEMBERS[text] ?? ANY_METHOD, patterns: yield* fold(world, value, 0), body: null };
}

/** An in-tree function whose return is one of our URLs, by its declaration key, with the paths it returns. */
interface Builder {
  readonly name: string;
  readonly patterns: readonly Pattern[];
  readonly start: number;
  readonly end: number;
  readonly file: string;
}

// A return that builds a string: a template, a concatenation, a branch, a replace or a path literal.
function buildsString(value: Expression): boolean {
  const expression = unwrap(value);
  return (
    isTemplateExpression(expression) ||
    isConditionalExpression(expression) ||
    (isBinaryExpression(expression) && expression.operatorToken.kind === SyntaxKind.PlusToken) ||
    (isCallExpression(expression) && isPropertyAccessExpression(expression.expression)) ||
    ((isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) && expression.text.startsWith("/"))
  );
}

// Every in-tree function whose return builds one of our URLs, from the product's files.
function builders(world: NativeWorld, files: readonly SourceFile[]): ReadonlyMap<string, Builder> {
  const functions: { readonly name: Node; readonly fn: Node }[] = [];
  walkFiles(
    files.filter((source) => isProduction(world.fileOfSource(source))),
    (node) => {
      const fn = functionOf(node);
      const name = (node as { readonly name?: Node }).name;
      if (fn !== null && name !== undefined && isIdentifier(name) && returnsOf(fn).some(buildsString)) {
        functions.push({ name, fn });
      }
    },
  );
  const folded = world.batch(functions.map(({ fn }) => all(...returnsOf(fn).map((value) => fold(world, value, 0)))));
  const symbols = world.symbolsAt(functions.map(({ name }) => name));
  const found = new Map<string, Builder>();
  for (const [at, { name, fn }] of functions.entries()) {
    const patterns = (folded[at] ?? []).flat().filter((pattern) => callerPath(pattern) !== null);
    const symbol = symbols[at];
    if (patterns.length > 0 && symbol !== undefined) {
      const site = world.siteOf(fn);
      for (const key of declarationKeys(symbol)) {
        found.set(key, { name: (name as Identifier).text, patterns, start: fn.pos, end: fn.end, file: site.file });
      }
    }
  }
  return found;
}

// The members a URL write names: an object literal key or a JSX attribute fills its slot type's member, and an
// assignment's name is its own symbol.
function* writtenMembers(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly NativeSymbol[]> {
  const { checker } = world;
  const { parent } = name;
  if ((isPropertyAssignment(parent) && isObjectLiteralExpression(parent.parent)) || isJsxAttribute(parent)) {
    const slot = yield* checker.getContextualType.gen(parent.parent as Expression);
    if (slot === undefined) {
      return [];
    }
    const members = yield* propertiesNamed(checker, yield* checker.getNonNullableType.gen(slot), name.text);
    return members.filter((member): member is NativeSymbol => member !== undefined);
  }
  const own = yield* checker.getSymbolAtLocation.gen(name);
  return own === undefined ? [] : [own];
}

/** Every request the files send: platform request calls, URL member writes, and calls of URL builders. */
export function requestsOf(world: NativeWorld, files: readonly SourceFile[]): readonly Request[] {
  const built = builders(world, files);
  const calls: (CallExpression | NewExpression)[] = [];
  const builderCalls: { readonly call: Node; readonly name: Node }[] = [];
  const writes: { readonly name: Identifier; readonly value: Expression }[] = [];
  const builderNames = new Set([...built.values()].map((builder) => builder.name));
  const insideBuilder = (node: Node): boolean => {
    const { file } = world.siteOf(node);
    return [...built.values()].some((builder) => builder.file === file && node.pos >= builder.start && node.end <= builder.end);
  };
  walkFiles(files, (node) => {
    const written = urlWrite(node);
    if (written !== null) {
      writes.push(written);
    }
    if (!(isCallExpression(node) || isNewExpression(node))) {
      return;
    }
    const name = nameOf(unwrap(node.expression));
    if (name !== null && REQUEST_NAMES.has(name.text)) {
      calls.push(node);
    }
    if (name !== null && isCallExpression(node) && builderNames.has(name.text) && !insideBuilder(node)) {
      builderCalls.push({ call: node, name });
    }
  });
  const builderSymbols = world.symbolsAt(builderCalls.map(({ name }) => name));
  const requests = world.batch([
    ...calls.map((call) => platformCall(world, call)),
    ...writes.map(function* ({ name, value }): APIRequestGenerator<Request | null> {
      return yield* memberWrite(world, name, value, yield* writtenMembers(world, name));
    }),
  ]);
  const viaBuilders = builderCalls.flatMap(({ call }, at): Request[] => {
    const symbol = builderSymbols[at];
    const builder =
      symbol === undefined
        ? undefined
        : declarationKeys(symbol)
            .map((key) => built.get(key))
            .find((found) => found !== undefined);
    return builder === undefined ? [] : [{ site: world.siteOf(call), sink: "builder", method: ANY_METHOD, patterns: builder.patterns, body: null }];
  });
  return [...requests.flatMap((request) => (request === null ? [] : [request])), ...viaBuilders];
}

// A URL member a statement writes: `x.src = url`, `<img src={url} />`, `{ href: url }`.
function urlWrite(node: Node): { readonly name: Identifier; readonly value: Expression } | null {
  if (
    isBinaryExpression(node) &&
    node.operatorToken.kind === SyntaxKind.EqualsToken &&
    isPropertyAccessExpression(node.left) &&
    isIdentifier(node.left.name) &&
    Object.hasOwn(URL_MEMBERS, node.left.name.text)
  ) {
    return { name: node.left.name, value: node.right };
  }
  if (isJsxAttribute(node) && isIdentifier(node.name) && Object.hasOwn(URL_MEMBERS, node.name.text) && node.initializer !== undefined) {
    const value =
      node.initializer.kind === SyntaxKind.JsxExpression
        ? (node.initializer as { readonly expression?: Expression }).expression
        : (node.initializer as Expression);
    return value === undefined ? null : { name: node.name, value };
  }
  if (isPropertyAssignment(node) && isIdentifier(node.name) && Object.hasOwn(URL_MEMBERS, node.name.text) && isObjectLiteralExpression(node.parent)) {
    return { name: node.name, value: node.initializer };
  }
  return null;
}
