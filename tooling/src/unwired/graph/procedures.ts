// `pnpm unwired procedures` as a query over the graph session: each tRPC procedure and each HTTP route no production
// code calls. The client imports the router as one `AppRouter` type, so knip sees every procedure as used; the graph's
// origin walk places each property read on a tRPC proxy on the router record's own property, and this query reads the
// role sites the build kept for the router files (`BuildSession.siteFiles`). A procedure only tests or tooling call is
// `test-only`.
//
// - A caller is a read, call or delete site (`READS` in roles.ts) the graph gave the procedure's declaration. Escape is
//   no call: every router record hands its procedures whole to tRPC's `router()`.
// - A product caller is a product file's or snap's (state.ts `productReader`, D357), for procedures and routes alike.
// - A product site whose next link is a cache-key or filter verb tRPC declares, by the program's package answer, builds
//   a key and sends no request: it is counted in `keys` and calls nothing. A same-named method declared anywhere else
//   is a call.
// - A route is a call of a verb hono's app class declares, in any production file, by the declaration the checker
//   resolves: a registrar that moves keeps its routes, and a context's `get` is no route. Its path and each request's
//   URL fold through ./urls.ts.
// - A request to our origin is sent from any file but a server's: product code outside snap whose own world loads no DOM
//   library (worlds.ts `browserFiles`) fetches outward. Snap drives the real app over HTTP (owner ruling), so its request
//   is a product call; a Node test's or a tool's request is a test call.
// - A URL the server mints into its response (`c.json({ url: frameUrl(id) })`) is requested by the browser that reads it,
//   so the builder's call there is the request; the client's own fetch of that opaque string folds to nothing.
// - A route or procedure called from outside the repository sits in {@link OUTSIDE_CALLERS}, one reason per row, and is
//   printed so the owner can rule on each row.
import type { CallExpression, Expression, Node, PropertyAssignment, ShorthandPropertyAssignment, SourceFile } from "@typescript/native/ast";
import {
  isCallExpression,
  isElementAccessExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { DeliberateEntry } from "../deliberate.ts";
import { sortRows } from "../deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import type { NativeWorld } from "../native.ts";
import { declarationKeys, isPropertyName } from "../native.ts";
import { browserFiles, isProduction } from "../worlds.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import { READS, sameNode } from "./roles.ts";
import type { RoleSite } from "./state.ts";
import { productReader, SNAP_SOURCE } from "./state.ts";
import type { CallerPath, Pattern, Request, RouteMethod } from "./urls.ts";
import { ANY_METHOD, asMethod, callerPath, fold, HONO_APP, honoMember, literalsOf, merged, requestsOf, unwrap, walkFiles } from "./urls.ts";

// --- What the query reads -------------------------------------------------------------------------------------------

/** The router files: the root router and every domain router under it. The build keeps their declarations' role sites. */
export const PROCEDURE_HOMES = ["packages/server/src/transport/trpc/router.ts", "packages/server/src/transport/trpc/routers/"] as const;

const inHomes = (file: string, homes: readonly string[]): boolean => homes.some((home) => (home.endsWith("/") ? file.startsWith(home) : file === home));

const PROCEDURE_TYPES = ["query", "mutation", "subscription"] as const;
type ProcedureType = (typeof PROCEDURE_TYPES)[number];
// tRPC's own members: a procedure's `_def` carries its `type`, and a router's `_def` carries none.
const TRPC_DEF = "_def";
const TRPC_DEF_TYPE = "type";

// The scope every tRPC package is published under, as the program names a declaration's package.
const TRPC_SCOPE = "@trpc/";
// The tRPC proxy verbs that build a cache key or a filter and send no request. Every other verb a tRPC package
// declares on a procedure sends one.
const KEY_VERBS: ReadonlySet<string> = new Set(["queryKey", "queryFilter", "infiniteQueryKey", "infiniteQueryFilter", "mutationKey", "pathKey", "pathFilter"]);

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
  // The frame document's bootstrap defines orbPluginAssetUrl (packages/server/src/entry/http/plugin-frame.ts).
  {
    surface: "route",
    method: "GET",
    path: "/api/plugin-frame/:id/asset",
    reason:
      "a guest plugin's frame script loads its bundled images through orbPluginAssetUrl, which the frame document's bootstrap defines; guest scripts are outside the tree",
  },
];

/** What this query cannot see, printed with every run. */
const PROCEDURE_LIMITS: readonly string[] = [
  "A procedure reached through a computed key (trpc[name]) is not placed; a key the resolver cannot place reaches no procedure.",
  "A procedure value read whole (stored, passed on, destructured) counts as called; a queryKey, queryFilter or mutationKey alone does not.",
  "A proxy read the graph's origin walk cannot place is a lost read of the graph (pnpm unwired graph --explain-lost) and reaches no procedure.",
  "A URL counts where a platform request takes it, or where an in-tree URL builder's value reaches a URL slot (a request's URL, the URL constructor, an href, src or action write, a router's to) or a response the server sends. The value is followed through templates, concatenations and branches, builders, variables, in-tree parameters, returns and in-tree members or props; a URL in a Map or an array, or built by a function passed as a value, is not followed.",
  "A product file outside snap whose own world loads no DOM library sends no request to our routes: its fetch is outbound. A URL builder's call in that file counts only in a response it sends (c.json, c.redirect).",
  "A URL part the checker gives no literal type is one wildcard segment; a caller whose URL starts with a wildcard is unplaced and listed, never matched.",
  "A URL builder's method is unknown, so its call matches every method of the routes its URL fits.",
  "A request the e2e suite sends through Playwright's request API, and any request a script or the browser sends unprompted, is not seen.",
  "A route is a call of a verb member hono's app declares, in any production file; a verb read off the app and called later (a destructured get) registers nothing this query sees.",
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
  /** The graph is the one reading of procedures and routes, so nothing can disagree. */
  readonly disagreements: readonly string[];
  readonly outside: readonly OutsideRow[];
  /** Outside-caller rows that match no registration. */
  readonly stale: readonly OutsideCaller[];
  readonly unplaced: readonly UnplacedRequest[];
  readonly limits: readonly string[];
}

// --- Route matching -------------------------------------------------------------------------------------------------

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

// --- The inventory --------------------------------------------------------------------------------------------------

interface ProcedureRecord {
  /** The record property that declares it. */
  readonly declaration: Node;
  readonly name: string;
  readonly home: string;
  readonly file: string;
  readonly line: number;
  readonly type: ProcedureType;
}

interface RouteRecord {
  readonly method: RouteMethod;
  /** Hono's path segments: literals, `:param` and the `*` rest. */
  readonly segments: readonly string[];
  readonly path: string;
  readonly file: string;
  readonly line: number;
  readonly at: number;
}

/** The 1-based line of a node in the world's parse of its file. */
function lineOf(node: Node): number {
  const source = node.getSourceFile();
  return editorLineOf(source, node.getStart(source));
}

// Whether a symbol is declared, every declaration of it, in a package the program loaded as a library.
function* fromPackage(world: NativeWorld, symbol: NativeSymbol | undefined, owns: (name: string) => boolean): APIRequestGenerator<boolean> {
  if (symbol === undefined || symbol.declarations.length === 0) {
    return false;
  }
  const packages = yield* all(...symbol.declarations.map((handle) => world.packageOf(handle)));
  return packages.every((name) => name !== null && owns(name));
}

// A router record's property with the value it gives: an assignment's initializer, or the name a shorthand reads.
interface RecordMember {
  readonly member: PropertyAssignment | ShorthandPropertyAssignment;
  readonly value: Expression;
}

function recordMember(node: Node): RecordMember | null {
  if (!isObjectLiteralExpression(node.parent)) {
    return null;
  }
  if (isPropertyAssignment(node) && isPropertyName(node.name)) {
    return { member: node, value: node.initializer };
  }
  return isShorthandPropertyAssignment(node) && isIdentifier(node.name) ? { member: node, value: node.name } : null;
}

// A record property whose value names a router variable: the router it mounts.
const mountOf = ({ member }: RecordMember): PropertyAssignment | null =>
  isPropertyAssignment(member) && isIdentifier(unwrap(member.initializer)) ? member : null;

function* procedureType(world: NativeWorld, value: Expression): APIRequestGenerator<ProcedureType | null> {
  const { checker } = world;
  const definition = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(value), TRPC_DEF);
  const kind = definition === undefined ? undefined : yield* checker.getPropertyOfType.gen(yield* checker.getTypeOfSymbol.gen(definition), TRPC_DEF_TYPE);
  const literal = kind === undefined ? null : yield* literalsOf(yield* checker.getTypeOfSymbol.gen(kind));
  const [text] = literal?.length === 1 ? (literal[0] ?? []) : [];
  return PROCEDURE_TYPES.find((type) => type === text) ?? null;
}

// Every procedure in the router files, with the path its routers mount it under.
function procedureInventory(world: NativeWorld, files: readonly SourceFile[]): readonly ProcedureRecord[] {
  const members: RecordMember[] = [];
  walkFiles(files, (node) => {
    const member = recordMember(node);
    if (member !== null) {
      members.push(member);
    }
  });
  const types = world.batch(members.map(({ value }) => procedureType(world, value)));
  const procedures = members.flatMap(({ member }, at) => {
    const type = types[at];
    return type === null || type === undefined ? [] : [{ member, type }];
  });
  const routerNames = members.flatMap((member, at) => {
    const mount = types[at] === null ? mountOf(member) : null;
    return mount === null ? [] : [mount];
  });
  const mountedSymbols = world.symbolsAt(routerNames.map((member) => unwrap(member.initializer)));
  // A router variable's declaration key to the record property that mounts it.
  const mounts = new Map<string, PropertyAssignment>();
  for (const [mount, symbol] of routerNames.map((member, at) => [member, mountedSymbols[at]] as const)) {
    for (const key of symbol === undefined ? [] : declarationKeys(symbol)) {
      mounts.set(key, mount);
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
  // A record's mount path; `seen` holds the records already on it, so a mount cycle ends the path there.
  const pathOf = (record: Node, seen: ReadonlySet<string>): string => {
    const call = record.parent;
    const holder = isCallExpression(call) ? call.parent : undefined;
    const key = `${world.siteOf(record).file}#${String(record.pos)}-${String(record.end)}`;
    if (holder === undefined || seen.has(key)) {
      return "";
    }
    const onPath = new Set([...seen, key]);
    if (isPropertyAssignment(holder) && isObjectLiteralExpression(holder.parent)) {
      return joined(pathOf(holder.parent, onPath), holder.name.getText());
    }
    if (!(isVariableDeclaration(holder) && isIdentifier(holder.name))) {
      return "";
    }
    const mount = (variableKeys.get(holder) ?? []).map((found) => mounts.get(found)).find((found) => found !== undefined);
    return mount === undefined ? holder.name.text : joined(pathOf(mount.parent, onPath), mount.name.getText());
  };
  return procedures.map(({ member, type }) => {
    const { name } = member;
    return {
      declaration: member,
      name: isPropertyName(name) ? name.text : name.getText(),
      home: pathOf(member.parent, new Set()),
      file: world.siteOf(name).file,
      line: lineOf(name),
      type,
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

// The methods a registration takes: a verb member's own, or each one `app.on`'s first argument folds to.
function* methodsOf(world: NativeWorld, fixed: RouteMethod | null, first: Expression): APIRequestGenerator<readonly RouteMethod[]> {
  if (fixed !== null) {
    return [fixed];
  }
  return (yield* fold(world, first)).map((pattern) => (pattern.includes(null) ? ANY_METHOD : asMethod(pattern.join(""))));
}

// Every Hono route the production files register, one per path its registration can take: a call of a member hono's app
// class declares, wherever the registrar sits. A member access names its member, so only a verb's name can be one.
function routeInventory(world: NativeWorld, files: readonly SourceFile[]): readonly RouteRecord[] {
  const calls: CallExpression[] = [];
  walkFiles(files, (node) => {
    if (isCallExpression(node) && isPropertyAccessExpression(node.expression) && Object.hasOwn(HONO_VERBS, node.expression.name.text)) {
      calls.push(node);
    }
  });
  const found = world.batch(
    calls.map(function* (call): APIRequestGenerator<readonly RouteRecord[]> {
      const member = yield* honoMember(world, call);
      if (member === null || member.container !== HONO_APP || !Object.hasOwn(HONO_VERBS, member.name)) {
        return [];
      }
      const fixed = HONO_VERBS[member.name] ?? null;
      const [first, second] = call.arguments;
      const pathArgument = fixed === null ? second : first;
      if (first === undefined || pathArgument === undefined) {
        return [];
      }
      const methods = yield* methodsOf(world, fixed, first);
      const paths = yield* fold(world, pathArgument);
      const { file, position } = world.siteOf(call);
      const line = lineOf(call);
      return methods.flatMap((routeMethod) =>
        paths.flatMap((pattern) => {
          const segments = routeSegments(pattern);
          return segments === null
            ? []
            : [{ method: routeMethod, segments, path: segments[0] === REST ? REST : `/${segments.join("/")}`, file, line, at: position }];
        }),
      );
    }),
  );
  const unique = new Map(found.flat().map((route) => [`${route.method} ${route.path} ${route.file}:${String(route.at)}`, route] as const));
  return [...unique.values()];
}

// --- Procedure callers ----------------------------------------------------------------------------------------------

interface Tally {
  readonly production: Set<string>;
  readonly test: Set<string>;
  readonly keys: Set<string>;
}

const emptyTally = (): Tally => ({ production: new Set(), test: new Set(), keys: new Set() });

// The property name a role site's position starts: the occurrence the build resolved.
function nameAt(source: SourceFile, at: number): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (node.pos <= at && at < node.end) {
      if (node.pos === at && isPropertyName(node)) {
        found = node;
      }
      node.forEachChild(visit);
    }
  };
  source.forEachChild(visit);
  return found;
}

// The access a procedure name sits in: `x.name` or `x["name"]`, else the name.
function accessOf(name: Node): Node {
  const { parent } = name;
  return (isPropertyAccessExpression(parent) && sameNode(parent.name, name)) || (isElementAccessExpression(parent) && sameNode(parent.argumentExpression, name))
    ? parent
    : name;
}

// Whether the link after a procedure name is a key or filter verb a tRPC package declares.
function* buildsKey(world: NativeWorld, name: Node): APIRequestGenerator<boolean> {
  const access = accessOf(name);
  const next = access.parent;
  if (!(isPropertyAccessExpression(next) && sameNode(next.expression, access) && KEY_VERBS.has(next.name.text))) {
    return false;
  }
  return yield* fromPackage(world, yield* world.checker.getSymbolAtLocation.gen(next.name), (pkg) => pkg.startsWith(TRPC_SCOPE));
}

// A procedure's declaration key among the ones the build kept sites for: the same file, span and kind.
function keyOfDeclaration(world: NativeWorld, keys: readonly DeclKey[], declaration: Node): DeclKey | undefined {
  const file = world.fileOfSource(declaration.getSourceFile());
  return keys.find((key) => {
    const parts = declKeyParts(key);
    return parts.file === file && parts.pos === declaration.pos && parts.end === declaration.end && parts.kind === declaration.kind;
  });
}

// A procedure's read, call and delete sites among the role sites the build gave its declaration.
function callerSites(
  world: NativeWorld,
  sites: ReadonlyMap<DeclKey, readonly RoleSite[]>,
  keys: readonly DeclKey[],
  procedure: ProcedureRecord,
): readonly RoleSite[] {
  const key = keyOfDeclaration(world, keys, procedure.declaration);
  return (key === undefined ? [] : (sites.get(key) ?? [])).filter(({ role }) => READS.has(role));
}

// The name a product caller site starts, for the key check; a test's site has none to check.
function productName(world: NativeWorld, file: string, at: number): Node | undefined {
  const source = productReader(file) ? world.source(file) : undefined;
  return source === undefined ? undefined : nameAt(source, at);
}

// Each procedure's caller sites: a test's, a product call, or a product site that only builds a key.
function tallyProcedures(
  world: NativeWorld,
  sites: ReadonlyMap<DeclKey, readonly RoleSite[]>,
  procedures: readonly ProcedureRecord[],
): ReadonlyMap<ProcedureRecord, Tally> {
  const keys = [...sites.keys()];
  const tallies = new Map(procedures.map((procedure) => [procedure, emptyTally()] as const));
  const product: { readonly tally: Tally; readonly site: string; readonly name: Node }[] = [];
  for (const [procedure, tally] of tallies) {
    for (const { file, at } of callerSites(world, sites, keys, procedure)) {
      const site = `${file}:${String(at)}`;
      const name = productName(world, file, at);
      if (name === undefined) {
        (productReader(file) ? tally.production : tally.test).add(site);
      } else {
        product.push({ tally, site, name });
      }
    }
  }
  const keyed = world.batch(product.map(({ name }) => buildsKey(world, name)));
  for (const [at, { tally, site }] of product.entries()) {
    (keyed[at] === true ? tally.keys : tally.production).add(site);
  }
  return tallies;
}

// --- Route callers --------------------------------------------------------------------------------------------------

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

const callerTree = (file: string): CallerTree => (productReader(file) ? "production" : "test");

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
    // A pattern that starts with a wildcard is no path the query can match, so the request is listed for a person.
    if (tree === "production" && request.patterns.some((pattern) => merged(pattern)[0] === null)) {
      unplaced.push(request);
    }
    const into = sites[tree];
    for (const route of paths.flatMap((path) => routesFor(request, path, routes))) {
      into.set(route, (into.get(route) ?? new Set<string>()).add(`${request.site.file}:${String(request.site.position)}`));
    }
  }
  return {
    credits: new Map(routes.map((route) => [route, { production: sites.production.get(route)?.size ?? 0, test: sites.test.get(route)?.size ?? 0 }] as const)),
    unplaced,
  };
}

// --- The query ------------------------------------------------------------------------------------------------------

const outsideKey = (row: OutsideCaller): string => (row.surface === "route" ? `route ${row.method} ${row.path}` : `procedure ${row.procedure}`);
const routeKey = (route: RouteRecord): string => `route ${route.method} ${route.path}`;
const procedurePath = (procedure: ProcedureRecord): string => {
  const [, ...mounted] = procedure.home.split(".");
  return [...mounted, procedure.name].join(".");
};
const procedureKey = (procedure: ProcedureRecord): string => `procedure ${procedurePath(procedure)}`;

type OutsideIndex = ReadonlyMap<string, { readonly row: OutsideCaller; readonly at: string[]; calls: number }>;

function judgeProcedures(tallies: ReadonlyMap<ProcedureRecord, Tally>, outside: OutsideIndex): readonly SurfaceFinding[] {
  const findings: SurfaceFinding[] = [];
  for (const [procedure, tally] of tallies) {
    const row = outside.get(procedureKey(procedure));
    if (row !== undefined) {
      row.at.push(`${procedure.file}:${String(procedure.line)}`);
      row.calls += tally.production.size;
    } else if (tally.production.size === 0) {
      findings.push({
        key: procedureKey(procedure),
        kind: tally.test.size > 0 ? "test-only-procedure" : "uncalled-procedure",
        file: procedure.file,
        line: procedure.line,
        home: procedure.home,
        member: procedure.name,
        tests: tally.test.size,
        keys: tally.keys.size,
      });
    }
  }
  return findings;
}

function judgeRoutes(routes: readonly RouteRecord[], credits: ReadonlyMap<RouteRecord, Credit>, outside: OutsideIndex): readonly SurfaceFinding[] {
  const findings: SurfaceFinding[] = [];
  for (const route of routes) {
    const credit = credits.get(route) ?? { production: 0, test: 0 };
    const row = outside.get(routeKey(route));
    if (row !== undefined) {
      row.at.push(`${route.file}:${String(route.line)}`);
      row.calls += credit.production;
    } else if (credit.production === 0) {
      findings.push({
        key: routeKey(route),
        kind: credit.test > 0 ? "test-only-route" : "uncalled-route",
        file: route.file,
        line: route.line,
        home: route.method,
        member: route.path,
        tests: credit.test,
        keys: 0,
      });
    }
  }
  return findings;
}

/** The deliberate and judged lists a report sorts its rows by. */
export interface ProceduresOptions {
  readonly root: string;
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged?: readonly JudgedEntry[];
}

/** Every tRPC procedure and HTTP route of a built graph with no production caller. */
export function proceduresOf(graph: Graph, world: NativeWorld, options: ProceduresOptions): ProceduresReport {
  const sources = graph.files.flatMap((file) => world.source(file) ?? []);
  const homed = (homes: readonly string[]): readonly SourceFile[] => sources.filter((source) => inHomes(world.fileOfSource(source), homes));
  const procedures = procedureInventory(world, homed(PROCEDURE_HOMES));
  const routes = routeInventory(
    world,
    sources.filter((source) => isProduction(world.fileOfSource(source))),
  );
  const outside = new Map(OUTSIDE_CALLERS.map((row) => [outsideKey(row), { row, at: [] as string[], calls: 0 }] as const));
  const browser = browserFiles(options.root);
  const requests = requestsOf(world, sources, (file) => browser.has(file) || file.startsWith(SNAP_SOURCE) || !productReader(file));
  const { credits, unplaced } = routeCredits(routes, requests);
  const findings = [...judgeProcedures(tallyProcedures(world, graph.facts.roleSites, procedures), outside), ...judgeRoutes(routes, credits, outside)];
  const sorted = findings.toSorted((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.member.localeCompare(y.member));
  const { unwired, deliberate, judged, staleJudged } = sortRows(sorted, options);
  const rows = [...outside.values()];
  const lineAt = (request: Request): number => {
    const source = world.source(request.site.file);
    return source === undefined ? 1 : editorLineOf(source, request.site.position);
  };
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
      .map((request) => ({ file: request.site.file, line: lineAt(request), sink: request.sink }))
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
