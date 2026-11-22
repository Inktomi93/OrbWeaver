// `pnpm unwired procedures` reports each tRPC procedure and HTTP route no production code calls. Every planted case
// has a twin the scan must keep reporting: a same-named method, a name in a string table and a type read reach no
// procedure; a route's other method, a lookalike path and an uncalled URL builder reach no route.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanProcedures } from "../../../tooling/src/unwired/index.ts";
import { LIB } from "./_planted.ts";

const WORLD = "tsconfig.json";
// Planted source spells its own template literals; the placeholder sign is interpolated so this file has none in a string.
const DOLLAR = "$";
const TSCONFIG = plantedTsconfig({ lib: [...LIB, "DOM"], include: ["packages", "tests"], jsx: "preserve" });

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
    "});",
  ].join("\n"),
  "packages/server/src/transport/trpc/router.ts": [
    'import { procedure, router } from "@trpc/server";',
    'import { tagRouter } from "./routers/tag.ts";',
    "export const appRouter = router({ health: procedure.query(() => true), ping: procedure.query(() => true), tag: tagRouter });",
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
  "tests/server/tag.test.ts": [
    'import { trpc } from "../../packages/client/src/trpc.ts";',
    "export const pruned = (): Promise<unknown> => trpc.tag.prune.mutate();",
  ].join("\n"),
};

const scan = (root: string): ReturnType<typeof scanProcedures> =>
  scanProcedures({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });

const found = (report: ReturnType<typeof scanProcedures>): readonly string[] =>
  report.unwired.map(({ kind, home, member, tests, keys }) => `${kind} ${home} ${member} tests=${String(tests)} keys=${String(keys)}`).toSorted();

test("a procedure is called through the client proxy, the server's caller or a typed relay, and nothing else", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = scan(await plantedTree(PROCEDURE_TREE));
  expect(report.procedures).toBe(10);
  expect(found(report)).toEqual([
    "test-only-procedure appRouter.tag prune tests=1 keys=0",
    "uncalled-procedure appRouter ping tests=0 keys=0",
    "uncalled-procedure appRouter.tag named tests=0 keys=0",
    "uncalled-procedure appRouter.tag rename tests=0 keys=0",
    "uncalled-procedure appRouter.tag stale tests=0 keys=1",
    "uncalled-procedure appRouter.tag typed tests=0 keys=0",
  ]);
  // The health procedure is excused by its outside-caller row, never by a caller; its twin `ping` stays reported.
  expect(report.outside.map(({ row, at, calls }) => ({ surface: row.surface, at, calls }))).toEqual([
    { surface: "procedure", at: ["packages/server/src/transport/trpc/router.ts:3"], calls: 0 },
  ]);
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
    '  app.get("/healthz", () => null);',
    `  app.get(\`${DOLLAR}{pattern.prefix}:id${DOLLAR}{pattern.suffix}\`, () => null);`,
    '  app.on("POST", "/api/auth/oidc/backchannel-logout", () => null);',
    "  app.use(() => null);",
    "}",
  ].join("\n"),
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
  ].join("\n"),
  "tests/server/dump.test.ts": 'export const dumped = (): Promise<Response> => fetch("/api/debug/dump");\n',
};

test("a route is called by a platform request, a URL attribute or a URL builder's call, matched by method and path", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = scan(await plantedTree(ROUTE_TREE));
  // The policy registrar folds once per member of its union, so it registers two routes and no cross of their parts.
  expect(report.routes).toBe(10);
  expect(found(report)).toEqual([
    "test-only-route GET /api/debug/dump tests=1 keys=0",
    "uncalled-route GET /api/orphan tests=0 keys=0",
    "uncalled-route GET /api/upload tests=0 keys=0",
    "uncalled-route GET /api/widget/:id/asset tests=0 keys=0",
  ]);
  expect(report.unplaced).toEqual([
    { file: "packages/client/src/requests.tsx", line: 4, sink: "src" },
    { file: "packages/client/src/requests.tsx", line: 12, sink: "fetch" },
  ]);
  expect(report.outside.map(({ row, at }) => ({ row: row.surface === "route" ? `${row.method} ${row.path}` : row.procedure, at }))).toEqual([
    { row: "POST /api/auth/oidc/backchannel-logout", at: ["packages/server/src/entry/http/routes.ts:14"] },
    { row: "GET /healthz", at: ["packages/server/src/entry/http/routes.ts:12"] },
  ]);
  expect(report.stale.map((row) => (row.surface === "route" ? `${row.method} ${row.path}` : row.procedure)).toSorted()).toEqual([
    "GET *",
    "GET /api/auth/oidc/callback",
    "GET /join/:token",
    "health",
  ]);
});
