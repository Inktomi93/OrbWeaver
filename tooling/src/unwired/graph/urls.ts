// The URLs the tree requests and the routes they can reach, read off the merged program the graph session holds. A URL
// folds through the checker to segment patterns: literals, templates, constants, unions of literal types and in-tree URL
// builders. A request is one the platform sends: `fetch`, a navigation, a beacon, an event stream, or a URL member the
// platform declares, written by assignment, JSX attribute or object key. A call to an in-tree function that returns one
// of our URLs is a request only where the call sits in a URL slot of a file that sends to our origin, or in a response the
// server sends, once its value is followed to where it is used ({@link reaches}): a string that starts with "/" in a toast or a CSS comment is no
// URL. A fold follows each constant and function once per path, so only a cycle ends it, in a wildcard.
import type {
  CallExpression,
  Expression,
  Identifier,
  NewExpression,
  Node,
  ParameterDeclaration,
  ShorthandPropertyAssignment,
  SourceFile,
  TemplateExpression,
} from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isConditionalExpression,
  isExportSpecifier,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isImportClause,
  isImportDeclaration,
  isImportSpecifier,
  isInterfaceDeclaration,
  isJsxAttribute,
  isMethodDeclaration,
  isNamedImports,
  isNamespaceImport,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadElement,
  isStringLiteral,
  isTemplateExpression,
  isTemplateSpan,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SymbolFlags } from "@typescript/native/sync";
import type { Site } from "../classify.ts";
import type { NativeWorld } from "../native.ts";
import { declarationHome, declarationKeys, hasFlag, isFunctionLike, isPlatform, platformMember, propertiesNamed } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { URL_MEMBERS } from "./library-names.ts";
import { HONO_PACKAGE, NAVIGATION_MEMBER, REACT_ROUTER, ROUTER_CORE, TRPC_CLIENT, TRPC_LINK_URL, URL_CONSTRUCTOR } from "./library-names.ts";
import { unwrap } from "./resolve.ts";
import { sameNode } from "./roles.ts";

const ROUTE_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "ALL"] as const;
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

// URL members a library declares (library-names.ts URL_MEMBERS): writing one loads it. A form's action posts with a
// method the form owns.
const URL_METHODS: Readonly<Record<(typeof URL_MEMBERS)[number], RouteMethod>> = { href: "GET", src: "GET", action: ANY_METHOD, formAction: ANY_METHOD };
const isUrlMember = (text: string): text is (typeof URL_MEMBERS)[number] => Object.hasOwn(URL_METHODS, text);

// --- URL patterns -------------------------------------------------------------------------------------------------

/** A folded string: literal text, with `null` where the checker gives no literal. */
export type Pattern = readonly (string | null)[];
const UNKNOWN: readonly Pattern[] = [[null]];

// The declarations a fold is inside on its way to the current node, by their node keys: a constant's initializer or a
// function's returns.
type FoldPath = ReadonlySet<string>;
const NO_HOPS: FoldPath = new Set();

// A node's identity across the program's node handles: its file, span and kind.
const nodeKey = (world: NativeWorld, node: Node): string => `${world.siteOf(node).file}#${String(node.pos)}-${String(node.end)}.${String(node.kind)}`;

// One pattern per distinct spelling, so alternatives that agree never multiply a cross.
function distinct(patterns: readonly Pattern[]): readonly Pattern[] {
  return [...new Map(patterns.map((pattern) => [JSON.stringify(pattern), pattern] as const)).values()];
}

function cross(lists: readonly (readonly Pattern[])[]): readonly Pattern[] {
  let out: readonly Pattern[] = [[]];
  for (const list of lists) {
    out = distinct(out.flatMap((head) => list.map((tail) => [...head, ...tail])));
  }
  return out;
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
  return parts.every((part) => part.isStringLiteralType()) ? parts.map((part) => [part.value]) : null;
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

/** Folds an expression to the strings it can be, through the checker. A constant or a function is followed once on
 *  each path through the fold, so a cycle ends in a wildcard and every other chain is followed to its end. */
export function* fold(world: NativeWorld, node: Expression, path: FoldPath = NO_HOPS): APIRequestGenerator<readonly Pattern[]> {
  const expression = unwrap(node);
  if (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) {
    return [[expression.text]];
  }
  if (isTemplateExpression(expression)) {
    return yield* foldTemplate(world, expression, path);
  }
  if (isBinaryExpression(expression)) {
    const kind = expression.operatorToken.kind;
    if (kind === SyntaxKind.PlusToken) {
      return cross(yield* all(fold(world, expression.left, path), fold(world, expression.right, path)));
    }
    if (kind === SyntaxKind.QuestionQuestionToken || kind === SyntaxKind.BarBarToken) {
      return distinct((yield* all(fold(world, expression.left, path), fold(world, expression.right, path))).flat());
    }
  }
  if (isConditionalExpression(expression)) {
    return distinct((yield* all(fold(world, expression.whenTrue, path), fold(world, expression.whenFalse, path))).flat());
  }
  if (isCallExpression(expression)) {
    const called = yield* foldCall(world, expression, path);
    if (called !== null) {
      return called;
    }
  }
  return yield* foldValue(world, expression, path);
}

// The path a fold takes into a declaration, or null when the fold is already inside it.
function enter(world: NativeWorld, path: FoldPath, declaration: Node): FoldPath | null {
  const key = nodeKey(world, declaration);
  return path.has(key) ? null : new Set([...path, key]);
}

// A value's literal type, else the initializer of the constant or the property it names.
function* foldValue(world: NativeWorld, expression: Expression, path: FoldPath): APIRequestGenerator<readonly Pattern[]> {
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
  // a parameter folds to its default, the value a call that omits it passes
  const initializer =
    declaration !== undefined && (isVariableDeclaration(declaration) || isPropertyAssignment(declaration) || isParameterDeclaration(declaration))
      ? declaration.initializer
      : undefined;
  const inside = initializer === undefined || declaration === undefined ? null : enter(world, path, declaration);
  return initializer === undefined || inside === null ? UNKNOWN : yield* fold(world, initializer, inside);
}

// A template whose spans read one receiver of a union of object types folds once per member of the union, so two of
// its spans never pair values from different members.
function* foldTemplate(world: NativeWorld, template: TemplateExpression, path: FoldPath): APIRequestGenerator<readonly Pattern[]> {
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
        const head = own === undefined ? yield* fold(world, span.expression, path) : ((yield* literalsOf(yield* checker.getTypeOfSymbol.gen(own))) ?? UNKNOWN);
        return cross([head, [[span.literal.text]]]);
      }),
    );
    folded.push(...cross([[[template.head.text]], ...spans]));
  }
  return distinct(folded);
}

// `text.replace(":id", id)` keeps the text with the replaced part as a wildcard; an in-tree function folds to what it
// returns. Null for any other call, whose type is read instead.
function* foldCall(world: NativeWorld, call: CallExpression, path: FoldPath): APIRequestGenerator<readonly Pattern[] | null> {
  const { checker } = world;
  const callee = unwrap(call.expression);
  const name = nameOf(callee);
  if (name === null) {
    return null;
  }
  const symbol = yield* unaliased(world, yield* checker.getSymbolAtLocation.gen(name));
  const platform = isPropertyAccessExpression(callee) ? yield* platformMember(world, symbol) : null;
  if (isPropertyAccessExpression(callee) && platform?.container === STRING_INTERFACE && STRING_REPLACERS.has(platform.name)) {
    const [target] = call.arguments;
    const receiver = yield* fold(world, callee.expression, path);
    return target !== undefined && (isStringLiteral(target) || isNoSubstitutionTemplateLiteral(target))
      ? receiver.map((pattern) => replaced(pattern, target.text))
      : receiver;
  }
  const fn = functionOf(yield* declarationOf(world, symbol));
  if (fn === null) {
    return null;
  }
  const inside = enter(world, path, fn);
  if (inside === null) {
    return UNKNOWN;
  }
  const returned = yield* all(...returnsOf(fn).map((value) => fold(world, value, inside)));
  return returned.length === 0 ? null : distinct(returned.flat());
}

// The platform's `String` members that replace a part of their receiver.
const STRING_INTERFACE = "String";
const STRING_REPLACERS: ReadonlySet<string> = new Set(["replace", "replaceAll"]);

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
  // a library's own `fetch` or `open` sends no platform request
  const platform = yield* all(...symbol.declarations.map((handle) => isPlatform(world, handle)));
  if (!platform.every(Boolean)) {
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
  return bound !== undefined && (isVariableDeclaration(bound) || isParameterDeclaration(bound)) && bound.initializer !== undefined
    ? yield* fold(world, bound.initializer)
    : UNKNOWN;
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
    patterns = yield* fold(world, declaration.initializer);
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
  return { site: world.siteOf(call), sink: key, method, patterns: yield* fold(world, url), body: shape.body };
}

// A write of a URL member the platform declares: an assignment, a JSX attribute or an object literal key.
function* memberWrite(world: NativeWorld, name: Identifier, value: Expression, resolved: readonly NativeSymbol[]): APIRequestGenerator<Request | null> {
  const { text } = name;
  if (resolved.length === 0 || !resolved.every((member) => outsideTree(world, member))) {
    return null;
  }
  const patterns = isShorthandPropertyAssignment(value.parent) ? yield* shorthandValue(world, value.parent) : yield* fold(world, value);
  if (text !== TRPC_LINK_URL) {
    return { site: world.siteOf(name), sink: text, method: isUrlMember(text) ? URL_METHODS[text] : ANY_METHOD, patterns, body: null };
  }
  const packages = yield* all(...resolved.flatMap((member) => member.declarations).map((handle) => world.packageOf(handle)));
  // a tRPC client link's `url` option: the link sends each procedure call to its path under the URL
  return packages.every((pkg) => pkg === TRPC_CLIENT)
    ? { site: world.siteOf(name), sink: text, method: ANY_METHOD, patterns: patterns.map((pattern) => [...pattern, "/", null]), body: null }
    : null;
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
  const folded = world.batch(functions.map(({ fn }) => all(...returnsOf(fn).map((value) => fold(world, value)))));
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
  if (((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent)) && isObjectLiteralExpression(parent.parent)) || isJsxAttribute(parent)) {
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

// The packages whose navigation options take a URL as their `to` member.
const ROUTER_PACKAGES: ReadonlySet<string> = new Set([REACT_ROUTER, ROUTER_CORE]);

// The expression a value is, through parentheses, assertions and `satisfies`.
function outermost(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at.parent) || isAsExpression(at.parent) || isSatisfiesExpression(at.parent) || isNonNullExpression(at.parent)) {
    at = at.parent;
  }
  return at;
}

// Whether a member a value is written to is a URL member a library declares, never a same-named member of ours.
function* libraryUrlMember(world: NativeWorld, name: Identifier): APIRequestGenerator<boolean> {
  if (!isUrlMember(name.text)) {
    return false;
  }
  const members = yield* writtenMembers(world, name);
  return members.length > 0 && members.every((member) => outsideTree(world, member));
}

// Whether a member a value is written to is a router's navigation target, by the package that declares it.
function* routerTarget(world: NativeWorld, name: Identifier): APIRequestGenerator<boolean> {
  if (name.text !== NAVIGATION_MEMBER) {
    return false;
  }
  const members = yield* writtenMembers(world, name);
  const declarations = members.flatMap((member) => member.declarations);
  if (declarations.length === 0) {
    return false;
  }
  const packages = yield* all(...declarations.map((handle) => world.packageOf(handle)));
  return packages.every((owner) => owner !== null && ROUTER_PACKAGES.has(owner));
}

// The member name a value is written to: a JSX attribute's, an object key's (a shorthand's too), or an assignment target's.
function writtenName(at: Node): Identifier | null {
  const { parent } = at;
  if (parent.kind === SyntaxKind.JsxExpression && isJsxAttribute(parent.parent) && isIdentifier(parent.parent.name)) {
    return parent.parent.name;
  }
  if (isPropertyAssignment(parent) && sameNode(parent.initializer, at) && isIdentifier(parent.name)) {
    return parent.name;
  }
  if (isShorthandPropertyAssignment(parent) && sameNode(parent.name, at) && isIdentifier(parent.name)) {
    return parent.name;
  }
  const assigned =
    isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.EqualsToken && sameNode(parent.right, at) && isPropertyAccessExpression(parent.left);
  return assigned && isIdentifier(parent.left.name) ? parent.left.name : null;
}

// What one builder call's value is followed with: the builders, which files send to our origin, the declarations this
// value has already been followed through (each once), and the declarations whose reads are known to reach a slot,
// shared by every value because a found path holds for each of them.
interface Flow {
  readonly world: NativeWorld;
  readonly built: ReadonlyMap<string, Builder>;
  readonly sends: (file: string) => boolean;
  readonly followed: Set<string>;
  readonly reaching: Set<string>;
}

// The operators whose result is built from the value: a concatenation and a fallback.
const COMPOSING: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.PlusToken, SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken]);

// The expression a value is part of: a template it is a span of, a concatenation, a fallback or a branch.
function composed(value: Node): Node {
  let at = outermost(value);
  for (;;) {
    const { parent } = at;
    if (isTemplateSpan(parent) && sameNode(parent.expression, at)) {
      at = outermost(parent.parent);
    } else if (
      (isBinaryExpression(parent) && COMPOSING.has(parent.operatorToken.kind)) ||
      (isConditionalExpression(parent) && !sameNode(parent.condition, at))
    ) {
      at = outermost(parent);
    } else {
      return at;
    }
  }
}

/** Whether a URL builder's value reaches a request: a URL slot in a file that sends to our origin (a platform request's
 *  URL argument, the URL constructor's input, an `href`, `src`, `action` or `formAction` write, a router's
 *  navigation `to`) or a response the server sends. The value is followed through what it is part of, another builder's
 *  argument, a variable, an in-tree function's parameter, a function's return to its calls, and an in-tree member or
 *  component prop to its reads, all resolved by declaration. */
function* reaches(flow: Flow, value: Node): APIRequestGenerator<boolean> {
  const { world } = flow;
  const at = composed(value);
  if (yield* inResponse(world, at)) {
    return true;
  }
  const name = writtenName(at);
  if (name !== null) {
    return yield* writeReaches(flow, at, name);
  }
  const { parent } = at;
  if (isVariableDeclaration(parent) && sameNode(parent.initializer, at) && isIdentifier(parent.name)) {
    return yield* readsReach(flow, parent.name, nodeKey(world, parent.name));
  }
  if (isReturnStatement(parent) || (isArrowFunction(parent) && sameNode(parent.body, at))) {
    const named = functionName(isReturnStatement(parent) ? enclosingFunction(parent) : parent);
    return named !== null && (yield* callsReach(flow, named));
  }
  return (isCallExpression(parent) || isNewExpression(parent)) && (yield* argumentReaches(flow, parent, at));
}

// Whether a value written to a member reaches a request: a URL member or a router's `to` in a file that sends to our
// origin, else the in-tree member's reads.
function* writeReaches(flow: Flow, at: Node, name: Identifier): APIRequestGenerator<boolean> {
  const { world } = flow;
  if ((yield* libraryUrlMember(world, name)) || (yield* routerTarget(world, name))) {
    return flow.sends(world.siteOf(at).file);
  }
  return yield* membersReach(flow, name);
}

// Whether a value passed as an argument reaches a request: as a platform request's URL, as a builder's input (the
// builder's call then carries it), or through the parameter of the in-tree function it is passed to.
function* argumentReaches(flow: Flow, call: CallExpression | NewExpression, at: Node): APIRequestGenerator<boolean> {
  const { world } = flow;
  const index = (call.arguments ?? []).findIndex((argument) => sameNode(argument, at));
  const callee = nameOf(unwrap(call.expression));
  if (index < 0 || callee === null) {
    return false;
  }
  const symbol = yield* unaliased(world, yield* world.checker.getSymbolAtLocation.gen(callee));
  const key = yield* requestKey(world, symbol);
  const shape = key === null ? undefined : REQUEST_CALLS[key];
  if (key === URL_CONSTRUCTOR || shape !== undefined) {
    return (shape?.url ?? 0) === index && flow.sends(world.siteOf(call).file);
  }
  if (symbol !== undefined && declarationKeys(symbol).some((declaration) => flow.built.has(declaration))) {
    return yield* reaches(flow, call);
  }
  const parameter = parametersOf(functionOf(yield* declarationOf(world, symbol)))[index];
  return (
    parameter !== undefined &&
    parameter.dotDotDotToken === undefined &&
    isIdentifier(parameter.name) &&
    (yield* readsReach(flow, parameter.name, nodeKey(world, parameter.name)))
  );
}

function parametersOf(fn: Node | null): readonly ParameterDeclaration[] {
  return fn !== null && (isFunctionDeclaration(fn) || isMethodDeclaration(fn) || isArrowFunction(fn) || isFunctionExpression(fn)) ? fn.parameters : [];
}

// The function a return statement returns from.
function enclosingFunction(statement: Node): Node | null {
  let at = statement.parent;
  while (!(isSourceFile(at) || isFunctionLike(at))) {
    at = at.parent;
  }
  return isSourceFile(at) ? null : at;
}

// The name a function is called by: its own, or the variable or object key it is the value of.
function functionName(fn: Node | null): Identifier | null {
  if (fn === null) {
    return null;
  }
  if ((isFunctionDeclaration(fn) || isMethodDeclaration(fn)) && fn.name !== undefined && isIdentifier(fn.name)) {
    return fn.name;
  }
  const { parent } = fn;
  if ((isVariableDeclaration(parent) || isPropertyAssignment(parent)) && sameNode(parent.initializer, fn) && isIdentifier(parent.name)) {
    return parent.name;
  }
  return null;
}

// The in-tree nodes find-references gives for a name, the name's own declaration included.
function* referencesOf(world: NativeWorld, name: Identifier): APIRequestGenerator<readonly Node[]> {
  const groups = yield* world.referencedSymbolsOf(name);
  const handles = groups.flatMap((group) => group.references).filter((handle) => world.fileOf(handle) !== null);
  const nodes = yield* all(...handles.map((handle) => handle.resolve.gen()));
  return nodes.filter((node): node is Node => node !== undefined);
}

// A reference that names a declaration, an import or a write rather than reading a value.
function namesNoValue(reference: Node): boolean {
  const { parent } = reference;
  if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.EqualsToken && sameNode(parent.left, reference)) {
    return true;
  }
  const named =
    isVariableDeclaration(parent) ||
    isParameterDeclaration(parent) ||
    isPropertySignatureDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    isPropertyAssignment(parent) ||
    isFunctionDeclaration(parent) ||
    isMethodDeclaration(parent) ||
    isJsxAttribute(parent);
  return (
    (named && sameNode(parent.name, reference)) || isImportSpecifier(parent) || isExportSpecifier(parent) || isImportClause(parent) || isNamespaceImport(parent)
  );
}

// Whether a read of the declaration `name` names reaches a request. A destructured binding is followed as its own
// declaration; a member read is followed from the access.
function* readsReach(flow: Flow, name: Identifier, key: string): APIRequestGenerator<boolean> {
  if (flow.reaching.has(key)) {
    return true;
  }
  if (flow.followed.has(key)) {
    return false;
  }
  flow.followed.add(key);
  const { world } = flow;
  for (const reference of yield* referencesOf(world, name)) {
    const { parent } = reference;
    let found = false;
    if (isBindingElement(parent) && sameNode(parent.name, reference) && isIdentifier(reference)) {
      found = yield* readsReach(flow, reference, nodeKey(world, reference));
    } else if (!namesNoValue(reference)) {
      found = yield* reaches(flow, isPropertyAccessExpression(parent) && sameNode(parent.name, reference) ? parent : reference);
    }
    if (found) {
      flow.reaching.add(key);
      return true;
    }
  }
  return false;
}

// Whether the in-tree member a value is written to is read where it reaches a request: a prop an in-tree component
// takes, or a key of an in-tree object type.
function* membersReach(flow: Flow, name: Identifier): APIRequestGenerator<boolean> {
  const { world } = flow;
  const members = (yield* writtenMembers(world, name)).filter((member) => !outsideTree(world, member));
  const keys = members.flatMap((member) => declarationKeys(member));
  return keys.length > 0 && (yield* readsReach(flow, name, keys.toSorted().join("|")));
}

// Whether a call of the function `name` names reaches a request with the value the function returns.
function* callsReach(flow: Flow, name: Identifier): APIRequestGenerator<boolean> {
  const { world } = flow;
  const key = `${nodeKey(world, name)}()`;
  if (flow.followed.has(key)) {
    return false;
  }
  flow.followed.add(key);
  for (const reference of yield* referencesOf(world, name)) {
    const { parent } = reference;
    const callee = isPropertyAccessExpression(parent) && sameNode(parent.name, reference) ? parent : reference;
    const call = callee.parent;
    if (isCallExpression(call) && sameNode(call.expression, callee) && (yield* reaches(flow, call))) {
      return true;
    }
  }
  return false;
}

/** The package whose context answers a request: a value handed to one of its members is the response's. */

// The value a literal holds it in, through object members, array elements and spreads, so `c.json({ url })` is read at
// the call that sends the object.
function holder(value: Node): Node {
  let at = outermost(value);
  for (;;) {
    const { parent } = at;
    if (isPropertyAssignment(parent) && sameNode(parent.initializer, at) && isObjectLiteralExpression(parent.parent)) {
      at = outermost(parent.parent);
    } else if (isArrayLiteralExpression(parent) || isSpreadElement(parent)) {
      at = outermost(parent);
    } else {
      return at;
    }
  }
}

/** The hono class whose members register routes, and the request class whose `param` reads a path parameter. */
export const HONO_APP = "Hono";
export const HONO_REQUEST = "HonoRequest";

/** The hono member a call's callee resolves to: its name and the class that declares it, by the declarations the
 *  checker resolves, every one of them hono's. Null for any other callee, a same-named member of ours included. */
export function* honoMember(
  world: NativeWorld,
  call: CallExpression,
): APIRequestGenerator<{ readonly name: string; readonly container: string | null } | null> {
  const callee = unwrap(call.expression);
  if (!(isPropertyAccessExpression(callee) && isIdentifier(callee.name))) {
    return null;
  }
  const symbol = yield* unaliased(world, yield* world.checker.getSymbolAtLocation.gen(callee.name));
  const declarations = symbol?.declarations ?? [];
  const packages = yield* all(...declarations.map((handle) => world.packageOf(handle)));
  if (symbol === undefined || packages.length === 0 || !packages.every((pkg) => pkg === HONO_PACKAGE)) {
    return null;
  }
  const nodes = yield* all(...declarations.map((handle) => handle.resolve.gen()));
  const containers = nodes.flatMap((node) => (node === undefined ? [] : [declarationHome(node).container]));
  return { name: symbol.name, container: containers[0] ?? null };
}

// The platform's Fetch `Response`, which a framework member that answers a request returns.
const RESPONSE = "Response";

/** Whether a call builds the response to a request: a member the HTTP framework declares, called for the platform's
 *  `Response`, as the request context's `json`, `text`, `body` and `redirect` are. A framework member that answers no
 *  Response, as the context's `set` or `get`, is the framework's own. */
export function* honoResponse(world: NativeWorld, call: CallExpression | NewExpression): APIRequestGenerator<boolean> {
  const callee = nameOf(unwrap(call.expression));
  const declarations = (callee === null ? undefined : yield* unaliased(world, yield* world.checker.getSymbolAtLocation.gen(callee)))?.declarations ?? [];
  const packages = yield* all(...declarations.map((handle) => world.packageOf(handle)));
  if (packages.length === 0 || !packages.every((pkg) => pkg === HONO_PACKAGE)) {
    return false;
  }
  const result: Type = yield* world.checker.getTypeAtLocation.gen(call);
  const parts = result.isUnionType() || result.isIntersectionType() ? yield* result.getTypes.gen() : [result];
  const symbols = yield* all(...parts.map((part) => part.getSymbol.gen()));
  const responses = symbols.flatMap((symbol) => (symbol?.name === RESPONSE ? symbol.declarations : []));
  const platform = yield* all(...responses.map((handle) => isPlatform(world, handle)));
  return platform.some(Boolean);
}

/** Whether a value is part of a response the server sends: an argument, directly or inside an object or array literal,
 *  of a call {@link honoResponse} answers for (`c.json`, `c.redirect`). The browser follows a URL it receives there, so
 *  the server's builder call is that URL's request. */
function* inResponse(world: NativeWorld, value: Node): APIRequestGenerator<boolean> {
  const at = holder(value);
  const call = at.parent;
  return isCallExpression(call) && call.arguments.some((argument) => sameNode(argument, at)) && (yield* honoResponse(world, call));
}

interface Sites {
  readonly calls: (CallExpression | NewExpression)[];
  readonly writes: { readonly name: Identifier; readonly value: Expression }[];
  readonly builderCalls: { readonly call: Node; readonly name: Node }[];
}

// The request sites a node is: a URL member write or a platform request call in a file that sends to our origin, or a
// builder call in any file. A call is kept by the name it may resolve to, its own or the one a renamed import names;
// the checker then decides.
interface CallNames {
  readonly request: (name: Identifier) => boolean;
  readonly builder: (name: Identifier) => boolean;
}

function collectSite(node: Node, sends: boolean, into: Sites, names: CallNames): void {
  const written = sends ? urlWrite(node) : null;
  if (written !== null) {
    into.writes.push(written);
  }
  if (!(isCallExpression(node) || isNewExpression(node))) {
    return;
  }
  const name = nameOf(unwrap(node.expression));
  if (name === null) {
    return;
  }
  if (sends && names.request(name)) {
    into.calls.push(node);
  }
  if (isCallExpression(node) && names.builder(name)) {
    into.builderCalls.push({ call: node, name });
  }
}

// The local names a file's renamed imports give, by the name each imports: `import { a as b }` maps b to a.
function importedAs(source: SourceFile): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const statement of source.statements) {
    const bindings = isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined;
    if (bindings !== undefined && isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.propertyName !== undefined && isIdentifier(element.propertyName)) {
          out.set(element.name.text, element.propertyName.text);
        }
      }
    }
  }
  return out;
}

/** Every request to our origin: platform request calls and URL member writes in a file that sends to it, a URL builder's
 *  call in a URL slot of such a file, and a URL builder's call in a response the server sends. The merged program gives
 *  every file the DOM's `fetch` and `Request`, so a server file's outbound fetch would otherwise read as a request to
 *  our routes; `sends` says which files send ours. */
export function requestsOf(world: NativeWorld, files: readonly SourceFile[], sends: (file: string) => boolean): readonly Request[] {
  const built = builders(world, files);
  const sites: Sites = { calls: [], writes: [], builderCalls: [] };
  const builderNames = new Set([...built.values()].map((builder) => builder.name));
  const insideBuilder = (node: Node): boolean => {
    const { file } = world.siteOf(node);
    return [...built.values()].some((builder) => builder.file === file && node.pos >= builder.start && node.end <= builder.end);
  };
  for (const source of files) {
    const sending = sends(world.fileOfSource(source));
    const renamed = importedAs(source);
    const spelled = (name: Identifier, names: ReadonlySet<string>): boolean => names.has(renamed.get(name.text) ?? name.text);
    walkFiles([source], (node) => {
      collectSite(node, sending, sites, {
        request: (name) => spelled(name, REQUEST_NAMES),
        builder: (name) => spelled(name, builderNames) && !insideBuilder(node),
      });
    });
  }
  const { calls, writes, builderCalls } = sites;
  const builderSymbols = world.symbolsAt(builderCalls.map(({ name }) => name));
  const reaching = new Set<string>();
  const requested = world.batch(builderCalls.map(({ call }) => reaches({ world, built, sends, followed: new Set(), reaching }, call)));
  const requests = world.batch([
    ...calls.map((call) => platformCall(world, call)),
    ...writes.map(function* ({ name, value }): APIRequestGenerator<Request | null> {
      return yield* memberWrite(world, name, value, yield* writtenMembers(world, name));
    }),
  ]);
  const viaBuilders = builderCalls.flatMap(({ call }, at): Request[] => {
    const symbol = requested[at] === true ? builderSymbols[at] : undefined;
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
    isUrlMember(node.left.name.text)
  ) {
    return { name: node.left.name, value: node.right };
  }
  if (isJsxAttribute(node) && isIdentifier(node.name) && isUrlMember(node.name.text) && node.initializer !== undefined) {
    const value =
      node.initializer.kind === SyntaxKind.JsxExpression
        ? (node.initializer as { readonly expression?: Expression }).expression
        : (node.initializer as Expression);
    return value === undefined ? null : { name: node.name, value };
  }
  const urlKey = (name: Identifier): boolean => isUrlMember(name.text) || name.text === TRPC_LINK_URL;
  if (isPropertyAssignment(node) && isIdentifier(node.name) && urlKey(node.name) && isObjectLiteralExpression(node.parent)) {
    return { name: node.name, value: node.initializer };
  }
  // a shorthand's value is the binding it names, which memberWrite folds through the checker
  return isShorthandPropertyAssignment(node) && isIdentifier(node.name) && urlKey(node.name) && isObjectLiteralExpression(node.parent)
    ? { name: node.name, value: node.name }
    : null;
}
