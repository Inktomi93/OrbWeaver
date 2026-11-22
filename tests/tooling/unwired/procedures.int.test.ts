// `pnpm unwired procedures` reports each tRPC procedure and HTTP route no production code calls. Every planted case
// has a twin the scan must keep reporting: a same-named method, a name in a string table and a type read reach no
// procedure; a route's other method, a lookalike path and an uncalled URL builder reach no route.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { JudgedEntry } from "../../../tooling/src/unwired/index.ts";
import { OUTSIDE_CALLERS, scanProcedures } from "../../../tooling/src/unwired/index.ts";
import { LIB } from "./_planted.ts";

const WORLD = "tsconfig.json";
// Planted source spells its own template literals; the placeholder sign is interpolated so this file has none in a string.
const DOLLAR = "$";
const TSCONFIG = plantedTsconfig({ lib: [...LIB, "DOM"], include: ["packages", "tests", "tooling"], jsx: "preserve" });

// The tRPC packages, typed the way the real ones are: a router record and both proxies are homomorphic mapped types,
// so a proxy member's symbol is the record's own property.
const TRPC = {
  "node_modules/@trpc/server/package.json": '{ "name": "@trpc/server", "types": "index.d.ts" }',
  "node_modules/@trpc/server/index.d.ts": [
    "export interface ProcedureDef<T extends string> { readonly type: T }",
    "export interface Procedure<T extends string> { readonly _def: ProcedureDef<T> }",
    "export interface Router<R> { readonly _def: { readonly record: R } }",
    "export type RouterRecord<T> = { [K in keyof T]: T[K] extends Router<infer R> ? R : T[K] };",
    "export declare function router<T>(record: T): Router<RouterRecord<T>>;",
    "export declare const procedure: { query(run: () => unknown): Procedure<'query'>; mutation(run: () => unknown): Procedure<'mutation'> };",
    "export type Caller<R> = { [K in keyof R]: R[K] extends Procedure<string> ? () => Promise<unknown> : Caller<R[K]> };",
    "export declare function createCaller<R>(router: Router<R>): Caller<R>;",
  ].join("\n"),
  "node_modules/@trpc/client/package.json": '{ "name": "@trpc/client", "types": "index.d.ts" }',
  "node_modules/@trpc/client/index.d.ts": [
    'import type { Procedure, Router } from "@trpc/server";',
    "type Query = { query(): Promise<unknown>; queryOptions(): unknown; queryKey(): unknown; queryFilter(): unknown };",
    "type Mutation = { mutate(input?: unknown): Promise<unknown>; mutationOptions(): unknown; mutationKey(): unknown };",
    "export type Decorated<R> = { [K in keyof R]: R[K] extends Procedure<'query'> ? Query : R[K] extends Procedure<'mutation'> ? Mutation : Decorated<R[K]> };",
    "export declare function createClient<T extends Router<unknown>>(): Decorated<T['_def']['record']>;",
  ].join("\n"),
};

// The outside-caller table's rows, planted from the scan's own table so a row change cannot drift from the cases.
const PROCEDURE_ROWS = OUTSIDE_CALLERS.flatMap((row) => (row.surface === "procedure" ? [row] : []));
const ROUTE_ROWS = OUTSIDE_CALLERS.flatMap((row) => (row.surface === "route" ? [row] : []));
const [UNPLANTED_ROUTE_ROW, ...PLANTED_ROUTE_ROWS] = ROUTE_ROWS;
const ROOT_PROCEDURES = PROCEDURE_ROWS.map((row) => `${row.procedure}: procedure.query(() => true), `).join("");

const PROCEDURE_TREE = {
  [WORLD]: TSCONFIG,
  ...TRPC,
  "packages/server/src/transport/trpc/routers/tag.ts": [
    'import { procedure, router } from "@trpc/server";',
    "export const tagRouter = router({",
    "  list: procedure.query(() => []),",
    "  rename: procedure.mutation(() => null),",
    "  prune: procedure.mutation(() => null),",
    "  stale: procedure.query(() => []),",
    "  relay: procedure.mutation(() => null),",
    "  named: procedure.mutation(() => null),",
    "  typed: procedure.query(() => []),",
    "  served: procedure.query(() => []),",
    "  probed: procedure.query(() => []),",
    "});",
  ].join("\n"),
  "packages/server/src/transport/trpc/router.ts": [
    'import { procedure, router } from "@trpc/server";',
    'import { tagRouter } from "./routers/tag.ts";',
    `export const appRouter = router({ ${ROOT_PROCEDURES}ping: procedure.query(() => true), tag: tagRouter });`,
    "export type AppRouter = typeof appRouter;",
  ].join("\n"),
  // The server calling its own procedure through the caller factory.
  "packages/server/src/entry/caller.ts": [
    'import { createCaller } from "@trpc/server";',
    'import { appRouter } from "../transport/trpc/router.ts";',
    "export const served = (): Promise<unknown> => createCaller(appRouter).tag.served();",
  ].join("\n"),
  "packages/client/src/trpc.ts": [
    'import { createClient } from "@trpc/client";',
    'import type { AppRouter } from "../../server/src/transport/trpc/router.ts";',
    "export const trpc = createClient<AppRouter>();",
  ].join("\n"),
  "packages/client/src/uses.ts": [
    'import { trpc } from "./trpc.ts";',
    "export const listed = trpc.tag.list.queryOptions();",
    // A cache key sends no request.
    "export const keyed = trpc.tag.stale.queryKey();",
    // The plugin host's one typed relay: the relayed function's name is data, never a procedure.
    'export const relayed = (): Promise<unknown> => trpc.tag.relay.mutate({ fn: "named" });',
    'export const HOST_FUNCTIONS = ["named", "rename", "typed"] as const;',
    "const other = { rename: (): number => 1 };",
    "export const renamed = other.rename();",
    "export type Typed = ReturnType<typeof trpc.tag.typed.query>;",
  ].join("\n"),
  // A tooling file is not production, so its call makes the procedure test-only, as the member scan reads it.
  "tooling/probe.ts": ['import { trpc } from "../packages/client/src/trpc.ts";', "export const probed = trpc.tag.probed.queryOptions();"].join("\n"),
  "tests/server/tag.test.ts": [
    'import { trpc } from "../../packages/client/src/trpc.ts";',
    "export const pruned = (): Promise<unknown> => trpc.tag.prune.mutate();",
  ].join("\n"),
};

const scan = (root: string, judged: readonly JudgedEntry[] = []): ReturnType<typeof scanProcedures> =>
  scanProcedures({ root, worlds: [WORLD], testWorlds: [], deliberate: [], judged, log: () => undefined });

const found = (report: ReturnType<typeof scanProcedures>): readonly string[] =>
  report.unwired.map(({ kind, home, member, tests, keys }) => `${kind} ${home} ${member} tests=${String(tests)} keys=${String(keys)}`).toSorted();

test("a procedure is called through the client proxy, the server's caller or a typed relay, and nothing else", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = scan(await plantedTree(PROCEDURE_TREE));
  expect(report.procedures).toBe(11);
  expect(found(report)).toEqual([
    "test-only-procedure appRouter.tag probed tests=1 keys=0",
    "test-only-procedure appRouter.tag prune tests=1 keys=0",
    "uncalled-procedure appRouter ping tests=0 keys=0",
    "uncalled-procedure appRouter.tag named tests=0 keys=0",
    "uncalled-procedure appRouter.tag rename tests=0 keys=0",
    "uncalled-procedure appRouter.tag stale tests=0 keys=1",
    "uncalled-procedure appRouter.tag typed tests=0 keys=0",
  ]);
  // A procedure row is excused by its outside-caller row, never by a caller; its twin `ping` stays reported.
  expect(report.outside.map(({ row, at, calls }) => ({ row, at, calls }))).toEqual(
    PROCEDURE_ROWS.map((row) => ({ row, at: ["packages/server/src/transport/trpc/router.ts:3"], calls: 0 })),
  );
  expect(report.stale).toEqual(ROUTE_ROWS);
});

const HONO = {
  "node_modules/hono/package.json": '{ "name": "hono", "types": "index.d.ts" }',
  "node_modules/hono/index.d.ts": [
    "export declare class Hono {",
    "  get(path: string, ...handlers: unknown[]): Hono;",
    "  post(path: string, ...handlers: unknown[]): Hono;",
    "  on(method: string, path: string, ...handlers: unknown[]): Hono;",
    "  use(...handlers: unknown[]): Hono;",
    "}",
  ].join("\n"),
  // A file-system open and a server adapter's fetch member share the platform's names and request nothing.
  "node_modules/fs-lib/package.json": '{ "name": "fs-lib", "types": "index.d.ts" }',
  "node_modules/fs-lib/index.d.ts": "export declare function open(path: string): Promise<unknown>;",
  "node_modules/server-lib/package.json": '{ "name": "server-lib", "types": "index.d.ts" }',
  "node_modules/server-lib/index.d.ts": "export interface ServeOptions { fetch(request: Request, bindings: unknown): Promise<Response>; port?: number }",
  // The element attributes the platform declares, outside the tree as React's are.
  "node_modules/planted-jsx/index.d.ts": [
    "declare namespace JSX {",
    "  interface Element {}",
    "  interface IntrinsicElements { img: { src?: string }; a: { href?: string } }",
    "}",
  ].join("\n"),
};

const ROUTE_TREE = {
  [WORLD]: TSCONFIG,
  ...HONO,
  "packages/contracts/src/routes.ts": [
    'export const BLOB_ROUTE = "/api/blob";',
    'export const UPLOAD_ROUTE = "/api/upload";',
    'export const EXPORT_ROUTES = { character: "/api/export/character/:id" } as const;',
    "export function blobUrl(hash: string): string {",
    `  return \`${DOLLAR}{BLOB_ROUTE}/${DOLLAR}{hash}\`;`,
    "}",
    "export function exportPath(id: string): string {",
    '  return EXPORT_ROUTES.character.replace(":id", id);',
    "}",
    // A URL builder nothing calls reaches no route.
    "export function orphanUrl(): string {",
    '  return "/api/orphan";',
    "}",
    // A builder that calls another credits nothing until something calls it.
    "export function orphanThumb(): string {",
    '  return orphanUrl() + "?w=1";',
    "}",
  ].join("\n"),
  "packages/server/src/entry/http/routes.ts": [
    'import type { Hono } from "hono";',
    'import { BLOB_ROUTE, EXPORT_ROUTES, UPLOAD_ROUTE } from "../../../../contracts/src/routes.ts";',
    'const POLICY = { doc: { prefix: "/api/frame/", suffix: "" }, asset: { prefix: "/api/widget/", suffix: "/asset" } } as const;',
    "export function register(app: Hono, route: keyof typeof POLICY): void {",
    "  const pattern = POLICY[route];",
    `  app.get(\`${DOLLAR}{BLOB_ROUTE}/:hash\`, () => null);`,
    "  app.post(UPLOAD_ROUTE, () => null);",
    "  app.get(UPLOAD_ROUTE, () => null);",
    "  app.get(EXPORT_ROUTES.character, () => null);",
    '  app.get("/api/debug/dump", () => null);',
    '  app.get("/api/orphan", () => null);',
    '  app.get("/api/debug/probe", () => null);',
    '  app.get("/api/opened", () => null);',
    `  app.get(\`${DOLLAR}{pattern.prefix}:id${DOLLAR}{pattern.suffix}\`, () => null);`,
    ...PLANTED_ROUTE_ROWS.map((row) => `  app.on(${JSON.stringify(row.method)}, ${JSON.stringify(row.path)}, () => null);`),
    "  app.use(() => null);",
    "}",
  ].join("\n"),
  // The debug registrar is a route home beside entry/http: a route only tooling calls is test-only, and one nothing calls
  // is uncalled.
  "packages/server/src/foundation/observability/debug/routes.ts": [
    'import type { Hono } from "hono";',
    "export function registerDebug(app: Hono): void {",
    '  app.get("/api/_debug/info", () => null);',
    '  app.get("/api/_debug/unread", () => null);',
    "}",
  ].join("\n"),
  "tooling/debug-info.ts": 'export const info = (): Promise<Response> => fetch("/api/_debug/info");\n',
  "packages/client/src/requests.tsx": [
    '/// <reference path="../../../node_modules/planted-jsx/index.d.ts" />',
    'import { blobUrl, exportPath, UPLOAD_ROUTE } from "../../contracts/src/routes.ts";',
    "function Avatar(props: { readonly src: string }): JSX.Element {",
    "  return <img src={props.src} />;",
    "}",
    'export const face = <Avatar src={blobUrl("h")} />;',
    'export const link = <a href={exportPath("c")} />;',
    'export const upload = (body: string): Promise<Response> => fetch(UPLOAD_ROUTE, { method: "POST", body });',
    'export const frame = (): Promise<Response> => fetch("/api/frame/f1");',
    'export const lookalike = (): Promise<Response> => fetch("/api/orphans");',
    'export const elsewhere = (): Promise<Response> => fetch("https://example.com/api/orphan");',
    "export const unknown = (url: string): Promise<Response> => fetch(url);",
    // A method written as a shorthand or a quoted key is read through the checker, so neither request is a GET.
    'export const shortUpload = (body: string): Promise<Response> => { const method = "POST"; return fetch(UPLOAD_ROUTE, { method, body }); };',
    'export const quoted = (body: string): Promise<Response> => fetch("/api/orphan", { "method": "POST", body });',
    // A URL that starts with a substitution is no path on our origin the scan can read, so it is listed.
    `export const based = (base: string): Promise<Response> => fetch(\`${DOLLAR}{base}/api/debug/dump\`);`,
    // The window's open is one sink however it is reached: a window member, a global, or both at once.
    'export const opened = (): Window | null => window.open("/api/opened", "_blank");',
    'export const openedLink = (url: URL): Window | null => window.open(url.href, "_blank");',
    "export const fetchedLink = (url: URL): Promise<Response> => window.fetch(url.href);",
    "export const assignedLink = (url: URL): void => window.location.assign(url.href);",
  ].join("\n"),
  "packages/server/src/infra/serve.ts": [
    'import { open } from "fs-lib";',
    'import type { ServeOptions } from "server-lib";',
    'export const read = (): Promise<unknown> => open("/api/orphan");',
    'export const relay = (options: Pick<ServeOptions, "fetch">, request: Request): Promise<Response> => options.fetch(request, {});',
  ].join("\n"),
  "tooling/probe.ts": 'export const probe = (): Promise<Response> => fetch("/api/debug/probe");\n',
  "tests/server/dump.test.ts": 'export const dumped = (): Promise<Response> => fetch("/api/debug/dump");\n',
};

test("a route is called by a platform request, a URL attribute or a URL builder's call, matched by method and path", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = scan(await plantedTree(ROUTE_TREE));
  // The policy registrar folds once per member of its union, so it registers two routes and no cross of their parts.
  expect(report.routes).toBe(12 + PLANTED_ROUTE_ROWS.length);
  expect(found(report)).toEqual([
    "test-only-route GET /api/_debug/info tests=1 keys=0",
    "test-only-route GET /api/debug/dump tests=1 keys=0",
    "test-only-route GET /api/debug/probe tests=1 keys=0",
    "uncalled-route GET /api/_debug/unread tests=0 keys=0",
    "uncalled-route GET /api/orphan tests=0 keys=0",
    "uncalled-route GET /api/upload tests=0 keys=0",
    "uncalled-route GET /api/widget/:id/asset tests=0 keys=0",
  ]);
  expect(report.unplaced).toEqual([
    { file: "packages/client/src/requests.tsx", line: 4, sink: "src" },
    { file: "packages/client/src/requests.tsx", line: 12, sink: "fetch" },
    { file: "packages/client/src/requests.tsx", line: 15, sink: "fetch" },
    { file: "packages/client/src/requests.tsx", line: 17, sink: "open" },
    { file: "packages/client/src/requests.tsx", line: 18, sink: "fetch" },
    { file: "packages/client/src/requests.tsx", line: 19, sink: "Location.assign" },
  ]);
  // Every planted row is matched, and the one row left unplanted reports as stale beside the procedure rows.
  expect(report.outside.map(({ row }) => row)).toEqual(PLANTED_ROUTE_ROWS);
  expect(report.stale).toEqual(OUTSIDE_CALLERS.filter((row) => row === UNPLANTED_ROUTE_ROW || row.surface === "procedure"));
});

// A judged row reports apart while its item file is in docs/work and not done; an entry whose row no longer reports,
// or whose item landed (its file deleted) or is done, is stale and its row reports as unjudged again.
const OPEN_ITEM = 4101;
const DONE_ITEM = 4102;
const LANDED_ITEM = 4103;
const workItem = (status: string): string => `---\nkind: work\nstatus: ${status}\nupdated: 2026-01-01\n---\n\n# A planted item\n`;
const JUDGED_TREE = {
  ...ROUTE_TREE,
  [`docs/work/${String(OPEN_ITEM)}-a-planted-open-item.md`]: workItem("open"),
  [`docs/work/${String(DONE_ITEM)}-a-planted-done-item.md`]: workItem("done"),
};
const ORPHAN: JudgedEntry = { key: "route GET /api/orphan", item: OPEN_ITEM, tie: "member" };
const UPLOAD: JudgedEntry = { key: "route GET /api/upload", item: DONE_ITEM, tie: "home" };
const ASSET: JudgedEntry = { key: "route GET /api/widget/:id/asset", item: LANDED_ITEM, tie: "member" };
const GONE: JudgedEntry = { key: "route GET /api/removed", item: OPEN_ITEM, tie: "member" };

test("a judged row reports apart with its open item, and an entry for a gone row or a closed item is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(JUDGED_TREE), [ORPHAN, UPLOAD, ASSET, GONE]);
  expect(found(report)).toEqual([
    "test-only-route GET /api/_debug/info tests=1 keys=0",
    "test-only-route GET /api/debug/dump tests=1 keys=0",
    "test-only-route GET /api/debug/probe tests=1 keys=0",
    "uncalled-route GET /api/_debug/unread tests=0 keys=0",
    "uncalled-route GET /api/upload tests=0 keys=0",
    "uncalled-route GET /api/widget/:id/asset tests=0 keys=0",
  ]);
  expect(report.judged.map(({ key, item, tie }) => ({ key, item, tie }))).toEqual([ORPHAN]);
  expect(report.staleJudged).toEqual([
    { ...UPLOAD, stale: "item-closed" },
    { ...ASSET, stale: "item-closed" },
    { ...GONE, stale: "row-gone" },
  ]);
});

// The world that holds the router can hold the debug registrar through an import and not entry/http. Each world lists
// the routes of the registrar files it homes, so both registrars' routes are inventoried whichever world opens first.
const SPLIT_TREE = {
  ...HONO,
  "packages/server/tsconfig.router.json": plantedTsconfig({ lib: LIB, include: ["src/transport"] }),
  "packages/server/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["src"] }),
  "packages/server/src/transport/trpc/router.ts": [
    'import { registerDebug } from "../../foundation/observability/debug/routes.ts";',
    "export const appRouter = { registerDebug };",
  ].join("\n"),
  "packages/server/src/foundation/observability/debug/routes.ts": [
    'import type { Hono } from "hono";',
    "export function registerDebug(app: Hono): void {",
    '  app.get("/api/_debug/unread", () => null);',
    "}",
  ].join("\n"),
  "packages/server/src/entry/http/routes.ts": [
    'import type { Hono } from "hono";',
    "export function register(app: Hono): void {",
    '  app.get("/api/plain", () => null);',
    "}",
  ].join("\n"),
};

test("an entry/http route and a debug route are both inventoried when the router's world holds only the debug registrar", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = scanProcedures({
    root: await plantedTree(SPLIT_TREE),
    worlds: ["packages/server/tsconfig.router.json", "packages/server/tsconfig.json"],
    testWorlds: [],
    deliberate: [],
    log: () => undefined,
  });
  expect(
    report.unwired
      .filter(({ key }) => key.startsWith("route "))
      .map(({ key, kind }) => `${kind} ${key}`)
      .toSorted(),
  ).toEqual(["uncalled-route route GET /api/_debug/unread", "uncalled-route route GET /api/plain"]);
});
