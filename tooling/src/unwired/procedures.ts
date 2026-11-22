// `pnpm unwired procedures`: each tRPC procedure and each HTTP route that no production code calls. The client imports
// the router as one `AppRouter` type, so knip sees every procedure as used; this scan asks the key resolver
// (`tooling/src/unwired/key-resolver.ts`) which procedure each property name on a tRPC proxy reaches. Through the proxy's
// homomorphic mapped types the checker's symbol is the router record's own property. A procedure only tests call is
// `test-only`, as in the member scan.
//
// A route is a Hono verb registration under `packages/server/src/entry/http/` or the debug registrar's directory. Its path and each caller's URL fold through
// the checker to segment patterns: literals, templates, constants, unions of literal types and in-tree URL builders. A
// caller is a request the platform sends: `fetch`, a navigation, a beacon, an event stream, or a URL attribute the
// platform declares. A call to an in-tree function that returns one of our URLs also counts as a caller of that route.
// A route called from outside the repository sits in {@link OUTSIDE_CALLERS}, one reason per row, and is printed so the
// owner can rule on each row.
import type {
  CallExpression,
  Expression,
  Identifier,
  NewExpression,
  Node,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  SourceFile,
  TemplateExpression,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isConditionalExpression,
  isElementAccessExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isJsxAttribute,
  isMethodDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
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
import { TRPC_PACKAGE } from "./boundaries.ts";
import type { Site } from "./classify.ts";
import { classifyReference, isProductionFile, Sources, siteKey } from "./classify.ts";
import type { JudgedSplit } from "./judged.ts";
import { resolveKeys } from "./key-resolver.ts";
import { declarationKeys, declaredBy, hasFlag, homeFiles, isPropertyName, NativeWorld } from "./native.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sortRows } from "./scan.ts";

// --- What the scan reads ------------------------------------------------------------------------------------------

/** The router files: the root router and every domain router under it. */
const PROCEDURE_HOMES = ["packages/server/src/transport/trpc/router.ts", "packages/server/src/transport/trpc/routers/"] as const;
/** The registrars of the server's own HTTP routes. */
// The debug registrar is a route home too: its surface is dev-only behind the debug gate, so its callers are tooling and
// tests, and a debug route nothing calls is surface nobody watches.
const ROUTE_HOMES = ["packages/server/src/entry/http/", "packages/server/src/foundation/observability/debug/"] as const;

const inHomes = (file: string, homes: readonly string[]): boolean => homes.some((home) => (home.endsWith("/") ? file.startsWith(home) : file === home));

const PROCEDURE_TYPES = ["query", "mutation", "subscription"] as const;
type ProcedureType = (typeof PROCEDURE_TYPES)[number];
// tRPC's own members: a procedure's `_def` carries its `type`, and a router's `_def` carries none.
const TRPC_DEF = "_def";
const TRPC_DEF_TYPE = "type";

// The tRPC proxy verbs that build a cache key or a filter and send no request. Every other verb a tRPC package
// declares on a procedure sends one.
const KEY_VERBS: ReadonlySet<string> = new Set(["queryKey", "queryFilter", "infiniteQueryKey", "infiniteQueryFilter", "mutationKey", "pathKey", "pathFilter"]);

const ROUTE_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "ALL"] as const;
/** A request method, or `ALL` for a route that takes every method and for a caller whose method the scan cannot read. */
type RouteMethod = (typeof ROUTE_METHODS)[number];
const ANY_METHOD: RouteMethod = "ALL";
const DEFAULT_METHOD: RouteMethod = "GET";

const HONO_PACKAGE = "/node_modules/hono/";
// Hono's route verbs and the method each registers; `on` takes its method as the first argument and its path second.
const HONO_VERBS: Readonly<Record<string, RouteMethod | null>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  options: "OPTIONS",
  all: "ALL",
  on: null,
};

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

/** A route or procedure called from outside the repository, with the reason it has no caller in the tree. */
type OutsideCaller =
  | { readonly surface: "route"; readonly method: RouteMethod; readonly path: string; readonly reason: string }
  | { readonly surface: "procedure"; readonly procedure: string; readonly reason: string };

/** Routes and procedures something outside the repository calls. The owner rules on each row before a report is judged;
 *  a row no registration matches reports as stale. */
export const OUTSIDE_CALLERS: readonly OutsideCaller[] = [
  {
    surface: "route",
    method: "GET",
    path: "/api/auth/oidc/callback",
    reason: "the identity provider redirects the browser here after sign-in",
  },
  {
    surface: "route",
    method: "POST",
    path: "/api/auth/oidc/backchannel-logout",
    reason: "the identity provider posts its logout token here, server to server",
  },
  { surface: "route", method: "GET", path: "/healthz", reason: "the container health check and external monitors probe it" },
  {
    surface: "procedure",
    procedure: "health",
    reason: "the deployment readiness probe: external health checks call it through the tRPC mount",
  },
  {
    surface: "route",
    method: "GET",
    path: "/join/:token",
    reason: "a person opens the invite link the app shares; the link carries the public origin, so no request in the tree names it",
  },
  { surface: "route", method: "GET", path: "*", reason: "the browser loads the app shell and its static files by navigation" },
];

/** What this scan cannot see, printed with every run. */
const PROCEDURE_LIMITS: readonly string[] = [
  "A procedure reached through a computed key (trpc[name]) is not placed; a key the resolver cannot place reaches no procedure.",
  "A procedure value that escapes (stored, passed on, destructured) counts as called; a queryKey, queryFilter or mutationKey alone does not.",
  "A URL counts only where a platform request takes it, or as the return of an in-tree function a call reaches; a URL handed through a component prop to an element is credited at the builder call, never at the element.",
  "A URL part the checker gives no literal type is one wildcard segment; a caller whose URL starts with a wildcard is unplaced and listed, never matched.",
  "A URL builder's method is unknown, so its call matches every method of the routes its URL fits.",
  "A request the e2e suite sends through Playwright's request API, and any request a script or the browser sends unprompted, is not seen.",
  "Routes registered outside packages/server/src/entry/http/ and the debug registrar under packages/server/src/foundation/observability/debug/ (the tRPC mount) are outside this scan.",
];

// --- Findings ---------------------------------------------------------------------------------------------------

const SURFACE_KINDS = ["uncalled-procedure", "test-only-procedure", "uncalled-route", "test-only-route"] as const;
/** `uncalled`: no call anywhere in the tree. `test-only`: only tests call it. */
type SurfaceKind = (typeof SURFACE_KINDS)[number];

interface SurfaceFinding {
  /** The outside-caller table's key for the procedure or route, which the judged list names it by. */
  readonly key: string;
  readonly kind: SurfaceKind;
  readonly file: string;
  readonly line: number;
  /** A procedure's router path from its root router's name, or a route's method. */
  readonly home: string;
  /** A procedure's key, or a route's path pattern. */
  readonly member: string;
  readonly tests: number;
  /** Production sites that only build a procedure's cache key or filter. */
  readonly keys: number;
}

/** One outside-caller row, the registrations it covers and the in-tree calls they have anyway. */
interface OutsideRow {
  readonly row: OutsideCaller;
  readonly at: readonly string[];
  readonly calls: number;
}

/** A request whose URL folds to no path on our origin, so it is matched to no route. */
interface UnplacedRequest {
  readonly file: string;
  readonly line: number;
  readonly sink: string;
}

export interface ProceduresReport {
  readonly scanned: number;
  readonly procedures: number;
  readonly routes: number;
  readonly unwired: readonly SurfaceFinding[];
  readonly deliberate: readonly (SurfaceFinding & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: JudgedSplit<SurfaceFinding>["judged"];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedSplit<SurfaceFinding>["staleJudged"];
  /** Engine two has no reading of procedures or routes, so nothing can disagree. */
  readonly disagreements: readonly string[];
  readonly outside: readonly OutsideRow[];
  /** Outside-caller rows that match no registration. */
  readonly stale: readonly OutsideCaller[];
  readonly unplaced: readonly UnplacedRequest[];
  readonly limits: readonly string[];
}

// --- URL patterns -------------------------------------------------------------------------------------------------

/** A folded string: literal text, with `null` where the checker gives no literal. */
type Pattern = readonly (string | null)[];
const UNKNOWN: readonly Pattern[] = [[null]];
// A fold past this many alternatives says nothing a wildcard does not.
const MAX_PATTERNS = 16;
// How many constants, builders and branches a fold follows from the site it starts at.
const FOLD_DEPTH = 6;

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

function unwrap(node: Expression): Expression {
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

function* literalsOf(type: Type): APIRequestGenerator<readonly Pattern[] | null> {
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

const isFunctionLike = (node: Node): boolean => isArrowFunction(node) || isFunctionExpression(node) || isFunctionDeclaration(node) || isMethodDeclaration(node);
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
function* fold(world: NativeWorld, node: Expression, depth: number): APIRequestGenerator<readonly Pattern[]> {
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
type CallerPath = readonly Pattern[];

// Adjacent literal parts as one, with no empty part, so a pattern starts with its first real text.
function merged(pattern: Pattern): Pattern {
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
function callerPath(pattern: Pattern): CallerPath | null {
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

// Whether one caller segment can be one route segment: a parameter takes anything, and a wildcard run fits a literal
// whose ends match the run's literal ends.
function segmentFits(caller: Pattern, route: string): boolean {
  if (route.startsWith(":")) {
    return true;
  }
  if (!caller.includes(null)) {
    return caller.join("") === route;
  }
  const head = caller[0];
  const tail = caller.at(-1);
  return (typeof head !== "string" || route.startsWith(head)) && (typeof tail !== "string" || route.endsWith(tail));
}

const REST = "*";
const isCatchAll = (route: RouteRecord): boolean => route.segments.length === 1 && route.segments[0] === REST;

function pathFits(caller: CallerPath, route: readonly string[]): boolean {
  for (const [at, segment] of route.entries()) {
    if (segment === REST) {
      return true;
    }
    const own = caller[at];
    if (own === undefined) {
      return segment.startsWith(":") && segment.endsWith("?");
    }
    if (!segmentFits(own, segment)) {
      return false;
    }
  }
  return caller.length === route.length;
}

const methodFits = (caller: RouteMethod, route: RouteMethod): boolean => caller === ANY_METHOD || route === ANY_METHOD || caller === route;

const asMethod = (text: string): RouteMethod => ROUTE_METHODS.find((method) => method === text.toUpperCase()) ?? ANY_METHOD;

// --- The inventory --------------------------------------------------------------------------------------------------

interface ProcedureRecord {
  readonly keys: readonly string[];
  readonly name: string;
  readonly home: string;
  readonly site: Site;
  readonly type: ProcedureType;
}

interface RouteRecord {
  readonly method: RouteMethod;
  /** Hono's path segments: literals, `:param` and the `*` rest. */
  readonly segments: readonly string[];
  readonly path: string;
  readonly site: Site;
}

function walkFiles(files: readonly SourceFile[], visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of files) {
    file.forEachChild(step);
  }
}

// The value a record property gives: a property assignment's initializer, or a shorthand's name.
function valueOfMember(member: RecordMember): Expression | null {
  if (isPropertyAssignment(member)) {
    return member.initializer;
  }
  return isIdentifier(member.name) ? member.name : null;
}

type RecordMember = PropertyAssignment | ShorthandPropertyAssignment;

const isMountMember = (member: RecordMember): member is PropertyAssignment => isPropertyAssignment(member) && isIdentifier(unwrap(member.initializer));

function* procedureType(world: NativeWorld, value: Expression): APIRequestGenerator<ProcedureType | null> {
  const { checker } = world;
  const definition = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(value), TRPC_DEF);
  const kind = definition === undefined ? undefined : yield* checker.getPropertyOfType.gen(yield* checker.getTypeOfSymbol.gen(definition), TRPC_DEF_TYPE);
  const literal = kind === undefined ? null : yield* literalsOf(yield* checker.getTypeOfSymbol.gen(kind));
  const [text] = literal?.length === 1 ? (literal[0] ?? []) : [];
  return PROCEDURE_TYPES.find((type) => type === text) ?? null;
}

// Every procedure in the router files, with the path its routers mount it under.
function procedureInventory(world: NativeWorld): readonly ProcedureRecord[] {
  const files = world.files.filter((source) => inHomes(world.siteOf(source).file, PROCEDURE_HOMES));
  const members: RecordMember[] = [];
  walkFiles(files, (node) => {
    if ((isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) && isObjectLiteralExpression(node.parent) && isPropertyName(node.name)) {
      members.push(node);
    }
  });
  const types = world.batch(members.map((member) => procedureType(world, valueOfMember(member) as Expression)));
  const procedures = members.filter((_, at) => types[at] !== null);
  const routerNames = members.filter((member, at): member is PropertyAssignment => types[at] === null && isMountMember(member));
  const mountedSymbols = world.symbolsAt(routerNames.map((member) => unwrap(member.initializer)));
  // A router variable's declaration key to the record property that mounts it.
  const mounts = new Map<string, PropertyAssignment>();
  for (const [at, symbol] of mountedSymbols.entries()) {
    for (const key of symbol === undefined ? [] : declarationKeys(symbol)) {
      mounts.set(key, routerNames[at] as PropertyAssignment);
    }
  }
  const variables: Node[] = [];
  walkFiles(files, (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name)) {
      variables.push(node.name);
    }
  });
  const variableKeys = new Map(
    world.symbolsAt(variables).map((symbol, at) => [variables[at]?.parent, symbol === undefined ? [] : declarationKeys(symbol)] as const),
  );
  const pathOf = (record: Node, seen: number): string => {
    const call = record.parent;
    const holder = isCallExpression(call) ? call.parent : undefined;
    if (holder === undefined || seen > FOLD_DEPTH) {
      return "";
    }
    if (isPropertyAssignment(holder) && isObjectLiteralExpression(holder.parent)) {
      return joined(pathOf(holder.parent, seen + 1), holder.name.getText());
    }
    if (!(isVariableDeclaration(holder) && isIdentifier(holder.name))) {
      return "";
    }
    const mount = (variableKeys.get(holder) ?? []).map((key) => mounts.get(key)).find((found) => found !== undefined);
    return mount === undefined || !isPropertyAssignment(mount) ? holder.name.text : joined(pathOf(mount.parent, seen + 1), mount.name.getText());
  };
  const symbols = world.symbolsAt(procedures.map((member) => member.name));
  return procedures.map((member, at) => {
    const { name } = member;
    return {
      keys: symbols[at] === undefined ? [] : declarationKeys(symbols[at]),
      name: isPropertyName(name) ? name.text : name.getText(),
      home: pathOf(member.parent, 0),
      site: world.siteOf(name),
      type: types[members.indexOf(member)] as ProcedureType,
    };
  });
}

const joined = (head: string, tail: string): string => (head === "" ? tail : `${head}.${tail}`);

// Hono's path text as segments; a wildcard in a folded path is a parameter.
function routeSegments(pattern: Pattern): readonly string[] | null {
  const text = pattern.map((part) => part ?? ":*").join("");
  if (text === REST) {
    return [REST];
  }
  return text.startsWith("/") ? text.split("/").slice(1) : null;
}

// Every Hono route the registrar files a world homes declare, one per path its registration can take.
function routeInventory(world: NativeWorld, home: ReadonlySet<string>): readonly RouteRecord[] {
  const files = world.files.filter((source) => {
    const { file } = world.siteOf(source);
    return home.has(file) && inHomes(file, ROUTE_HOMES);
  });
  const calls: CallExpression[] = [];
  walkFiles(files, (node) => {
    if (isCallExpression(node) && isPropertyAccessExpression(node.expression) && Object.hasOwn(HONO_VERBS, node.expression.name.text)) {
      calls.push(node);
    }
  });
  const { checker } = world;
  const found = world.batch(
    calls.map(function* (call): APIRequestGenerator<readonly RouteRecord[]> {
      const callee = call.expression;
      if (!(isPropertyAccessExpression(callee) && isIdentifier(callee.name))) {
        return [];
      }
      const method = yield* checker.getSymbolAtLocation.gen(callee.name);
      if (!declaredBy(method, HONO_PACKAGE)) {
        return [];
      }
      const fixed = HONO_VERBS[callee.name.text] ?? null;
      const [first, second] = call.arguments;
      const pathArgument = fixed === null ? second : first;
      if (pathArgument === undefined || (fixed === null && first === undefined)) {
        return [];
      }
      const methods =
        fixed === null
          ? (yield* fold(world, first as Expression, 0)).map((pattern) => (pattern.includes(null) ? ANY_METHOD : asMethod(pattern.join(""))))
          : [fixed];
      const paths = yield* fold(world, pathArgument, 0);
      const site = world.siteOf(call);
      return methods.flatMap((routeMethod) =>
        paths.flatMap((pattern) => {
          const segments = routeSegments(pattern);
          return segments === null ? [] : [{ method: routeMethod, segments, path: segments[0] === REST ? REST : `/${segments.join("/")}`, site }];
        }),
      );
    }),
  );
  const unique = new Map(found.flat().map((route) => [`${route.method} ${route.path} ${siteKey(route.site)}`, route] as const));
  return [...unique.values()];
}

// --- Procedure callers -------------------------------------------------------------------------------------------

const CALL_SHAPES = ["call", "key"] as const;
/** `call`: the reference sends the request, or the value escapes. `key`: it only builds a cache key or filter. */
type CallShape = (typeof CALL_SHAPES)[number];

// The access a procedure name sits in, and the verb read off it when the next link is a member access.
function accessOf(node: Node): Node {
  const { parent } = node;
  return (isPropertyAccessExpression(parent) && parent.name === node) || (isElementAccessExpression(parent) && parent.argumentExpression === node)
    ? parent
    : node;
}

function* callShape(world: NativeWorld, node: Node): APIRequestGenerator<CallShape> {
  const access = accessOf(node);
  const next = access.parent;
  if (!(isPropertyAccessExpression(next) && next.expression === access)) {
    return "call";
  }
  const verb = yield* world.checker.getSymbolAtLocation.gen(next.name);
  return declaredBy(verb, TRPC_PACKAGE) && KEY_VERBS.has(next.name.text) ? "key" : "call";
}

// A name the resolver may place on a procedure: a property read, a string key read, or a destructured member.
function isProcedureRead(node: Node): boolean {
  const { parent } = node;
  if (isPropertyAccessExpression(parent)) {
    return parent.name === node;
  }
  if (isElementAccessExpression(parent)) {
    return parent.argumentExpression === node;
  }
  return (
    isBindingElement(parent) &&
    isObjectBindingPattern(parent.parent) &&
    (parent.propertyName === node || (parent.propertyName === undefined && parent.name === node))
  );
}

interface Tally {
  readonly production: Set<string>;
  readonly test: Set<string>;
  readonly keys: Set<string>;
}

const emptyTally = (): Tally => ({ production: new Set(), test: new Set(), keys: new Set() });

/** What the scan has found so far: the inventory, each procedure's callers, and the one parse per file classify reads. */
interface Inventory {
  readonly sources: Sources;
  readonly procedures: readonly ProcedureRecord[];
  readonly routes: readonly RouteRecord[];
  readonly tallies: ReadonlyMap<string, Tally>;
}

function tallyProcedures(world: NativeWorld, home: ReadonlySet<string>, { sources, procedures, tallies }: Inventory): void {
  const names = new Set(procedures.map((procedure) => procedure.name));
  const candidates: Node[] = [];
  walkFiles(
    world.files.filter((source) => home.has(world.siteOf(source).file)),
    (node) => {
      if (isPropertyName(node) && names.has(node.text) && isProcedureRead(node)) {
        candidates.push(node);
      }
    },
  );
  const resolutions = resolveKeys(
    world,
    candidates.map((node) => ({ node })),
  );
  const placed = candidates.flatMap((node, at) => {
    const resolution = resolutions[at];
    const keys = resolution?.outcome === "members" ? resolution.members.flatMap(declarationKeys).filter((key) => tallies.has(key)) : [];
    return keys.length === 0 ? [] : [{ node, keys }];
  });
  const shapes = world.batch(placed.map(({ node }) => callShape(world, node)));
  for (const [at, { node, keys }] of placed.entries()) {
    const site = world.siteOf(node);
    const kind = classifyReference(sources.get(site.file), site.position, site.file);
    for (const tally of keys.flatMap((key) => tallies.get(key) ?? [])) {
      if (kind === "test") {
        tally.test.add(siteKey(site));
      } else if (kind === "use") {
        (shapes[at] === "key" ? tally.keys : tally.production).add(siteKey(site));
      }
    }
  }
}

// --- Route callers -----------------------------------------------------------------------------------------------

/** One request the tree sends: where, the method, the paths its URL can be, and the argument that carries its body. */
interface Request {
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

// Every production file the world holds, not only its home files: a call in this world may reach a builder whose file
// another world is home to.
function builders(world: NativeWorld): ReadonlyMap<string, Builder> {
  const functions: { readonly name: Node; readonly fn: Node }[] = [];
  walkFiles(
    world.files.filter((source) => isProductionFile(world.siteOf(source).file)),
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

// Every request one world's home files send: platform request calls, URL member writes, and calls of URL builders.
function requestsOf(world: NativeWorld, home: ReadonlySet<string>, built: ReadonlyMap<string, Builder>): readonly Request[] {
  const calls: (CallExpression | NewExpression)[] = [];
  const builderCalls: { readonly call: Node; readonly name: Node }[] = [];
  const writes: { readonly name: Identifier; readonly value: Expression }[] = [];
  const files = world.files.filter((source) => home.has(world.siteOf(source).file));
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
  const { checker } = world;
  const writeResolutions = resolveKeys(
    world,
    writes.map(({ name }) => ({ node: name })),
  );
  const builderSymbols = world.symbolsAt(builderCalls.map(({ name }) => name));
  const requests = world.batch([
    ...calls.map((call) => platformCall(world, call)),
    ...writes.map(function* ({ name, value }, at): APIRequestGenerator<Request | null> {
      const resolution = writeResolutions[at];
      const members = resolution?.outcome === "members" ? resolution.members : [];
      const symbol = members.length > 0 ? undefined : yield* checker.getSymbolAtLocation.gen(name);
      return yield* memberWrite(world, name, value, symbol === undefined ? members : [symbol]);
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

// --- The scan ------------------------------------------------------------------------------------------------------

const outsideKey = (row: OutsideCaller): string => (row.surface === "route" ? `route ${row.method} ${row.path}` : `procedure ${row.procedure}`);
const routeKey = (route: RouteRecord): string => `route ${route.method} ${route.path}`;
const procedurePath = (procedure: ProcedureRecord): string => {
  const [, ...mounted] = procedure.home.split(".");
  return [...mounted, procedure.name].join(".");
};
const procedureKey = (procedure: ProcedureRecord): string => `procedure ${procedurePath(procedure)}`;

/** Every tRPC procedure and HTTP route with no production caller, each world asked only about its home files. */
export function scanProcedures(options: ScanOptions): ProceduresReport {
  const { root, log } = options;
  const { worlds, testWorlds } = scanWorlds(options);
  const configs = [...worlds, ...testWorlds];
  const lists = NativeWorld.fileLists(root, configs);
  const homes = homeFiles(configs, lists);
  const holds = (config: string, homeList: readonly string[]): boolean => [...(lists.get(config)?.held ?? [])].some((file) => inHomes(file, homeList));
  // The world that holds the router files lists the inventory before any world's callers are asked.
  const ordered = configs.toSorted((a, b) => Number(holds(b, PROCEDURE_HOMES)) - Number(holds(a, PROCEDURE_HOMES)));
  const sources = new Sources(root);
  let procedures: readonly ProcedureRecord[] = [];
  const routes: RouteRecord[] = [];
  const tallies = new Map<string, Tally>();
  const requests = new Map<string, Request>();
  for (const config of ordered) {
    using world = NativeWorld.open(root, config);
    const held = world.files.map((file) => world.siteOf(file).file);
    if (procedures.length === 0 && held.some((file) => inHomes(file, PROCEDURE_HOMES))) {
      procedures = procedureInventory(world);
      for (const key of procedures.flatMap((procedure) => procedure.keys)) {
        tallies.set(key, emptyTally());
      }
      log(`procedures: ${config} declares ${String(procedures.length)} procedures`);
    }
    const home = homes.get(config) ?? new Set<string>();
    // Each registrar file is homed in one world, and the world that opens first can hold only some of them (the router's
    // world holds the debug registrar through an import, never entry/http), so every world lists the routes it homes.
    const registered = routeInventory(world, home);
    if (registered.length > 0) {
      routes.push(...registered);
      log(`procedures: ${config} registers ${String(registered.length)} routes`);
    }
    tallyProcedures(world, home, { sources, procedures, routes, tallies });
    for (const request of requestsOf(world, home, builders(world))) {
      requests.set(`${siteKey(request.site)} ${request.sink}`, request);
    }
  }
  return judge({ sources, procedures, routes, tallies }, [...requests.values()], options);
}

interface Credit {
  readonly production: number;
  readonly test: number;
}

// The routes one caller path reaches: every specific route it fits, else the catch-all routes.
function routesFor(request: Request, path: CallerPath, routes: readonly RouteRecord[]): readonly RouteRecord[] {
  const methodOk = routes.filter((route) => methodFits(request.method, route.method));
  const fit = methodOk.filter((route) => !isCatchAll(route) && pathFits(path, route.segments));
  return fit.length > 0 ? fit : methodOk.filter(isCatchAll);
}

const CALLER_TREES = ["production", "test"] as const;
type CallerTree = (typeof CALLER_TREES)[number];

// The member scan's rule (`classifyReference`): a production file's caller is production, and every other caller
// (tests, tooling, scripts) is a test's.
const callerTree = (file: string): CallerTree => (isProductionFile(file) ? "production" : "test");

function routeCredits(
  routes: readonly RouteRecord[],
  requests: readonly Request[],
): { readonly credits: ReadonlyMap<RouteRecord, Credit>; readonly unplaced: readonly Request[] } {
  const sites: Record<CallerTree, Map<RouteRecord, Set<string>>> = { production: new Map(), test: new Map() };
  const unplaced: Request[] = [];
  for (const request of requests) {
    const tree = callerTree(request.site.file);
    const paths = request.patterns.flatMap((pattern) => {
      const path = callerPath(pattern);
      return path === null ? [] : [path];
    });
    // A pattern that starts with a wildcard is no path the scan can match, so the request is listed for a person.
    if (tree === "production" && request.patterns.some((pattern) => merged(pattern)[0] === null)) {
      unplaced.push(request);
    }
    const into = sites[tree];
    for (const route of paths.flatMap((path) => routesFor(request, path, routes))) {
      into.set(route, (into.get(route) ?? new Set<string>()).add(siteKey(request.site)));
    }
  }
  return {
    credits: new Map(routes.map((route) => [route, { production: sites.production.get(route)?.size ?? 0, test: sites.test.get(route)?.size ?? 0 }] as const)),
    unplaced,
  };
}

type OutsideIndex = ReadonlyMap<string, { readonly row: OutsideCaller; readonly at: string[]; calls: number }>;

function judgeProcedures({ sources, procedures, tallies }: Inventory, outside: OutsideIndex): readonly SurfaceFinding[] {
  const findings: SurfaceFinding[] = [];
  for (const procedure of procedures) {
    const tally = procedure.keys.map((key) => tallies.get(key)).find((found) => found !== undefined) ?? emptyTally();
    const row = outside.get(procedureKey(procedure));
    if (row !== undefined) {
      row.at.push(`${procedure.site.file}:${String(sources.line(procedure.site))}`);
      row.calls += tally.production.size;
    } else if (tally.production.size === 0) {
      findings.push({
        key: procedureKey(procedure),
        kind: tally.test.size > 0 ? "test-only-procedure" : "uncalled-procedure",
        file: procedure.site.file,
        line: sources.line(procedure.site),
        home: procedure.home,
        member: procedure.name,
        tests: tally.test.size,
        keys: tally.keys.size,
      });
    }
  }
  return findings;
}

function judgeRoutes({ sources, routes }: Inventory, credits: ReadonlyMap<RouteRecord, Credit>, outside: OutsideIndex): readonly SurfaceFinding[] {
  const findings: SurfaceFinding[] = [];
  for (const route of routes) {
    const credit = credits.get(route) ?? { production: 0, test: 0 };
    const row = outside.get(routeKey(route));
    if (row !== undefined) {
      row.at.push(`${route.site.file}:${String(sources.line(route.site))}`);
      row.calls += credit.production;
    } else if (credit.production === 0) {
      findings.push({
        key: routeKey(route),
        kind: credit.test > 0 ? "test-only-route" : "uncalled-route",
        file: route.site.file,
        line: sources.line(route.site),
        home: route.method,
        member: route.path,
        tests: credit.test,
        keys: 0,
      });
    }
  }
  return findings;
}

function judge(inventory: Inventory, requests: readonly Request[], options: ScanOptions): ProceduresReport {
  const { sources, procedures, routes } = inventory;
  const outside = new Map(OUTSIDE_CALLERS.map((row) => [outsideKey(row), { row, at: [] as string[], calls: 0 }] as const));
  const { credits, unplaced } = routeCredits(routes, requests);
  const findings = [...judgeProcedures(inventory, outside), ...judgeRoutes(inventory, credits, outside)];
  const sorted = findings.toSorted((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.member.localeCompare(y.member));
  const { unwired, deliberate, judged, staleJudged } = sortRows(sorted, options);
  const rows = [...outside.values()];
  return {
    scanned: procedures.length + routes.length,
    procedures: procedures.length,
    routes: routes.length,
    unwired,
    deliberate,
    judged,
    staleJudged,
    disagreements: [],
    outside: rows.filter((row) => row.at.length > 0),
    stale: rows.filter((row) => row.at.length === 0).map((row) => row.row),
    unplaced: unplaced
      .map((request) => ({ file: request.site.file, line: sources.line(request.site), sink: request.sink }))
      .toSorted((x, y) => x.file.localeCompare(y.file) || x.line - y.line),
    limits: PROCEDURE_LIMITS,
  };
}

/** The outside-caller table and the scan's own counts, as the run prints them under its summary. */
export function outsideTable(report: ProceduresReport): string {
  const rows = report.outside.map(({ row, at, calls }) => `outside\t${outsideKey(row)}\t${at.join(",")}\tin-tree calls=${String(calls)}\t${row.reason}`);
  const stale = report.stale.map((row) => `stale outside row\t${outsideKey(row)}\t${row.reason}`);
  return [` procedures=${String(report.procedures)} routes=${String(report.routes)}`, ...rows, ...stale].join("\n");
}
