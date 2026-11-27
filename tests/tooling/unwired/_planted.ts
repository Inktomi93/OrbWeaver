// What the unwired scan suites plant beside the testkit's `plantedTsconfig`: the libs a node-only tree builds with,
// the one package world a single-world tree holds, and a JSX namespace, since a planted tree has no node_modules.

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { plantedTsconfig } from "@orb/testkit/tooling";
import type { Bucket, FieldsReport, GraphScan, JudgedEntry } from "../../../tooling/src/unwired/index.ts";
import { fieldsGraph, scanGraph } from "../../../tooling/src/unwired/index.ts";

/**
 * What a run's own error starts with when its compiler process dies: the read sees end of input, or the sync write hits
 * the broken pipe first (a crash recorded the SuppressedError's `.error` as "EPIPE: broken pipe, write"). Nothing else
 * is the run's own error.
 */
export const DEAD_CHANNEL_MESSAGES = ["Unexpected EOF", "EPIPE: broken pipe, write"] as const;

/** The libs of a planted tree with no DOM. */
export const LIB = ["ESNext"];

/** The one package world every single-world tree plants. */
export const WORLD = "packages/a/tsconfig.json";

/** A minimal JSX namespace, so a planted `.tsx` file type-checks its elements' props. */
export const JSX_NAMESPACE = [
  "declare namespace JSX {",
  "  interface Element {}",
  "  interface IntrinsicElements { [name: string]: Record<string, unknown> }",
  "  interface ElementChildrenAttribute { children: {} }",
  "}",
].join("\n");

/** A minimal `z`: its object schemas keep their keys and infer a value type the way zod does. */
export const ZOD_STUB = [
  "export interface Schema<V> { readonly value?: V; optional(): Schema<V | undefined> }",
  "const schema = <V>(): Schema<V> => ({ optional: () => schema<V | undefined>() });",
  "export type Infer<S> = S extends { readonly shape: infer T } ? { [K in keyof T]: T[K] extends Schema<infer V> ? V : never } : never;",
  "export const z = {",
  "  object: <T>(shape: T): { readonly shape: T } => ({ shape }),",
  "  discriminatedUnion: <T>(key: string, options: T): { readonly shape: T } => ({ shape: options }),",
  "  lazy: <T>(make: () => T): T => make(),",
  "  string: (): Schema<string> => schema<string>(),",
  "};",
  "export type Checked<T> = { readonly shape: unknown } & { readonly checked?: T };",
].join("\n");

/** A judged case's items: one open, one done. A landed item has no file, and the procedures suite plants that case. */
const OPEN_ITEM = 4101;
const DONE_ITEM = 4102;
const workItem = (status: string): string => `---\nkind: work\nstatus: ${status}\nupdated: 2026-01-01\n---\n\n# A planted item\n`;
/** The docs/work files a judged case plants beside its tree. */
export const JUDGED_WORK: Readonly<Record<string, string>> = {
  [`docs/work/${String(OPEN_ITEM)}-a-planted-open-item.md`]: workItem("open"),
  [`docs/work/${String(DONE_ITEM)}-a-planted-done-item.md`]: workItem("done"),
};
const GONE_KEY = "planted:Gone.row";

interface ReportedRow {
  readonly key: string;
  readonly home: string;
  readonly member: string;
}
interface JudgedReport {
  readonly unwired: readonly ReportedRow[];
  readonly judged: readonly (ReportedRow & { readonly item: number })[];
  readonly staleJudged: readonly { readonly key: string; readonly stale: string }[];
}

/** A judged case's rows by `home.member`. */
interface JudgedOutcome {
  readonly judged: readonly string[];
  readonly unwired: readonly string[];
  readonly stale: readonly string[];
}

const named = (row: ReportedRow): string => `${row.home}.${row.member}`;

/** The judged list a case plants, from a first report's rows: `open` to the open item, `closed` to the done item, and
 *  a key no row has. */
export function plantJudged(report: { readonly unwired: readonly ReportedRow[] }, open: string, closed: string): readonly JudgedEntry[] {
  const keyOf = (name: string): string => report.unwired.find((row) => named(row) === name)?.key ?? `missing ${name}`;
  return [
    { key: keyOf(open), item: OPEN_ITEM, tie: "member" },
    { key: keyOf(closed), item: DONE_ITEM, tie: "home" },
    { key: GONE_KEY, item: OPEN_ITEM, tie: "member" },
  ];
}

/** Where a judged case's rows landed, by `home.member`: the judged rows with their items, which of `open` and `closed`
 *  still report as unwired, and the stale entries. */
export function judgedOutcome(report: JudgedReport, open: string, closed: string): JudgedOutcome {
  const names = new Map(report.judged.map((row) => [row.key, named(row)]));
  for (const row of report.unwired) {
    names.set(row.key, named(row));
  }
  return {
    judged: report.judged.map((row) => `${named(row)} ${String(row.item)}`),
    unwired: [open, closed].filter((name) => report.unwired.some((row) => named(row) === name)),
    stale: report.staleJudged.map(({ key, stale }) => `${stale} ${names.get(key) ?? key}`),
  };
}

/** What every judged case expects of {@link judgedOutcome}. */
export const judgedExpected = (open: string, closed: string): JudgedOutcome => ({
  judged: [`${open} ${String(OPEN_ITEM)}`],
  unwired: [closed],
  stale: [`item-closed ${closed}`, `row-gone ${GONE_KEY}`],
});

/** The package a graph tree's sources sit in, unless a case names another. */
export const GRAPH_SOURCE = "packages/a/src";

// A planted workspace: a package, or the tooling workspace beside them.
const WORKSPACE_SOURCE = /^(packages\/[^/]+|tooling)\/src\//u;
const SOURCE_GLOB = "src/**/*.{ts,tsx}";
const TOOLING = "tooling";
const WHOLE = "**";

// A knip config with one workspace per planted package. With no `entries`, every source file ships and its exports are
// trusted, so the member buckets judge what the planted code does with them; with `entries`, only those files run and
// liveness decides the rest. The tooling workspace only consumes production, as the tree's knip view ignores it whole.
function graphKnip(packages: readonly string[], { entries, tags }: GraphTreeOptions): string {
  const workspace = (name: string): object => {
    if (entries === undefined) {
      return { entry: [`${SOURCE_GLOB}!`], project: [`${SOURCE_GLOB}!`], ignoreIssues: { [SOURCE_GLOB]: ["exports"] } };
    }
    const own = entries.filter((file) => file.startsWith(`${name}/`)).map((file) => `${file.slice(name.length + 1)}!`);
    return { entry: own, project: [`${SOURCE_GLOB}!`] };
  };
  const workspaces = Object.fromEntries(packages.map((name) => [name, name === TOOLING ? { ...workspace(name), ignore: [WHOLE] } : workspace(name)]));
  return plantedKnip({ tags: (tags ?? []).map((tag) => `-@${tag}`), workspaces });
}

/** A planted `knip.ts`: one config for both views, and the operator globs per workspace the graph's roots read. */
export function plantedKnip(config: object, operators: Readonly<Record<string, readonly string[]>> = {}): string {
  return [
    `const config = ${JSON.stringify(config)};`,
    "export default (_flags: { readonly production: boolean }) => config;",
    `export const operators = ${JSON.stringify(operators)};`,
    "export { config };",
  ].join("\n");
}

/** What a graph tree plants beyond its files: `.tsx` support, the entry files when liveness is the question, and the
 *  JSDoc tags knip is told to keep. */
export interface GraphTreeOptions {
  readonly jsx?: boolean;
  /** The world's own `types`, which the merged program resolves as the world does. */
  readonly types?: readonly string[];
  readonly entries?: readonly string[];
  readonly tags?: readonly string[];
}

/** A tree the graph scan reads: a solution config naming one world over every planted package, the merged program's
 *  option base, the knip config the roots come from, and `files` by repository path (a library stub under
 *  `node_modules/` included). */
export function graphTree(files: Readonly<Record<string, string>>, options: GraphTreeOptions = {}): Record<string, string> {
  const jsx = options.jsx === true ? ({ jsx: "preserve" } as const) : {};
  const packages = [...new Set(Object.keys(files).flatMap((file) => WORKSPACE_SOURCE.exec(file)?.[1] ?? []))];
  return {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }] }),
    "tsconfig.world-browser.json": plantedTsconfig({ lib: LIB, include: [], ...jsx }),
    [WORLD]: plantedTsconfig({ lib: LIB, include: ["../*/src"], ...jsx, ...(options.types === undefined ? {} : { types: options.types }) }),
    "knip.ts": graphKnip(packages, options),
    ...files,
  };
}

/** Scan a planted graph tree. */
export async function graphScan(
  plantedTree: (tree: Record<string, string>) => Promise<string>,
  files: Readonly<Record<string, string>>,
  options: GraphTreeOptions = {},
): Promise<GraphScan> {
  return await scanGraph(await plantedTree(graphTree(files, options)), () => undefined);
}

/** Run the fields query over a planted graph tree, its rows split by `rulings`. */
export async function fieldsScan(
  plantedTree: (tree: Record<string, string>) => Promise<string>,
  files: Readonly<Record<string, string>>,
  options: GraphTreeOptions = {},
  rulings: Parameters<typeof fieldsGraph>[1] = { deliberate: [], judged: [] },
): Promise<FieldsReport> {
  return await fieldsGraph(await plantedTree(graphTree(files, options)), rulings, () => undefined);
}

/** A fields report's rows in one planted file, as `Home.member kind`, sorted. */
export const fieldRows = (
  rows: readonly { readonly file: string; readonly home: string; readonly member: string; readonly kind: string }[],
  file: string,
): string[] =>
  rows
    .filter((row) => row.file.endsWith(file))
    .map(({ home, member, kind }) => `${home}.${member} ${kind}`)
    .toSorted();

/** A bucket's labels for one planted file, without its path: `Holder.member` for a member, the name for a unit. */
export const labelsIn = (scan: GraphScan, bucket: Bucket, file: string): readonly string[] =>
  scan.analysis[bucket].filter(({ label }) => label.startsWith(`${file}:`)).map(({ label }) => label.slice(file.length + 1));

/** A minimal React at React's own types path: the state hook the graph reads a `[value, setter]` tuple from, and the class
 *  component whose lifecycle methods React calls. */
export const REACT_TYPES = {
  "node_modules/@types/react/package.json": JSON.stringify({ name: "@types/react", types: "index.d.ts" }),
  "node_modules/@types/react/index.d.ts": [
    "export declare function useState<S>(initial: S): [S, (next: S) => void];",
    "export declare class Component<P = object> { readonly props: P; render(): unknown; componentDidMount?(): void }",
    // React's own shape: the statics React calls sit on the interfaces that build a Component, not on the class
    "export interface StaticLifecycle<P, S> { getDerivedStateFromProps?: (props: P, state: S) => Partial<S> | null; getDerivedStateFromError?: (error: unknown) => Partial<S> | null }",
    "export interface ComponentClass<P = object, S = object> extends StaticLifecycle<P, S> { new (props: P): Component<P>; displayName?: string; defaultProps?: Partial<P> }",
  ].join("\n"),
};

/** A minimal `@types/node` at its own path: the message doors' declarations and the platform a send reaches (the
 *  crypto and file modules, the console, a socket, fetch and the web bodies) where Node's types declare them. A planted
 *  source reaches it through `/// <reference types="node" />`, and its index reaches each module's file by
 *  `/// <reference path>` as the installed package's does, which the 7.1 program does not flag as an external library. */
export const NODE_TYPES = {
  "node_modules/@types/node/package.json": JSON.stringify({ name: "@types/node", types: "index.d.ts" }),
  "node_modules/@types/node/index.d.ts": [
    '/// <reference path="crypto.d.ts" />',
    '/// <reference path="fs.d.ts" />',
    '/// <reference path="globals.d.ts" />',
    '/// <reference path="worker_threads.d.ts" />',
    '/// <reference path="child_process.d.ts" />',
    '/// <reference path="process.d.ts" />',
    '/// <reference path="events.d.ts" />',
    '/// <reference path="diagnostics_channel.d.ts" />',
    '/// <reference path="async_hooks.d.ts" />',
    '/// <reference path="stream.d.ts" />',
    '/// <reference path="module.d.ts" />',
    '/// <reference path="util.d.ts" />',
  ].join("\n"),
  "node_modules/@types/node/crypto.d.ts": [
    'declare module "node:crypto" {',
    "  export class Hash { update(data: string): Hash; digest(encoding: string): string }",
    "  export function createHash(algorithm: string): Hash;",
    "}",
  ].join("\n"),
  "node_modules/@types/node/fs.d.ts": ['declare module "node:fs" {', "  export function writeFileSync(path: string, data: string): void;", "}"].join("\n"),
  "node_modules/@types/node/globals.d.ts": [
    // the file is a script: its top level is the global scope, as Node's globals are
    "interface Console { log(...data: unknown[]): void }",
    "declare var console: Console;",
    "declare class WebSocket { send(data: string): void }",
    "interface RequestInit { body?: string }",
    "declare function fetch(url: string, init?: RequestInit): Promise<unknown>;",
    "declare class Response { constructor(body: string) }",
    "declare class Blob { constructor(parts: readonly string[]) }",
    "declare class URL { constructor(input: string, base?: string | URL); readonly href: string }",
  ].join("\n"),
  "node_modules/@types/node/module.d.ts": [
    'declare module "node:module" {',
    "  export function createRequire(path: string): (id: string) => unknown;",
    "}",
  ].join("\n"),
  "node_modules/@types/node/util.d.ts": [
    'declare module "node:util" {',
    "  export function inspect(value: unknown): string;",
    "  export namespace inspect {",
    "    const custom: unique symbol;",
    "  }",
    "}",
  ].join("\n"),
  "node_modules/@types/node/worker_threads.d.ts": [
    // the package's own layout: the module is `node:worker_threads`, re-exported bare, and a Worker takes its listeners
    // from the events module's InternalEventEmitter rather than declaring them
    'declare module "node:worker_threads" {',
    '  import { InternalEventEmitter } from "events";',
    '  export class MessagePort { postMessage(value: any): void; on(event: "message", listener: (value: any) => void): this; }',
    "  interface WorkerEventMap { message: [value: any] }",
    "  export class Worker {",
    "    constructor(url: URL | string, options?: { workerData?: any });",
    "    postMessage(value: any): void;",
    "  }",
    "  export interface Worker extends InternalEventEmitter<WorkerEventMap> {}",
    "  export const parentPort: MessagePort | null;",
    "  export const workerData: any;",
    "}",
    'declare module "worker_threads" {',
    '  export * from "node:worker_threads";',
    "}",
  ].join("\n"),
  "node_modules/@types/node/child_process.d.ts": [
    'declare module "child_process" {',
    '  export interface ChildProcess { send(message: any): boolean; on(event: "message", listener: (message: any) => void): this; }',
    "  export function spawn(command: string, args: readonly string[]): ChildProcess;",
    "}",
  ].join("\n"),
  "node_modules/@types/node/process.d.ts": [
    'declare module "process" {',
    "  global {",
    "    var process: NodeJS.Process;",
    "    namespace NodeJS {",
    '      interface Process { send?(message: any): boolean; on(event: "message", listener: (message: any) => void): this; }',
    "    }",
    "  }",
    "}",
  ].join("\n"),
  "node_modules/@types/node/events.d.ts": [
    'declare module "events" {',
    "  export class EventEmitter { emit(event: string, ...args: any[]): boolean; on(event: string, listener: (...args: any[]) => void): this; }",
    "  export interface InternalEventEmitter<T> extends EventEmitter {",
    "    on<E extends keyof T>(eventName: E, listener: (...args: T[E] & any[]) => void): this;",
    "  }",
    "}",
  ].join("\n"),
  "node_modules/@types/node/diagnostics_channel.d.ts": [
    'declare module "diagnostics_channel" {',
    "  export class Channel { publish(message: unknown): void; subscribe(listener: (message: unknown) => void): void; }",
    "  export function channel(name: string): Channel;",
    "  export function subscribe(name: string, listener: (message: unknown) => void): void;",
    "}",
  ].join("\n"),
  // a library class that takes its listeners from the same emitter interface and is no message door
  "node_modules/@types/node/stream.d.ts": [
    'declare module "stream" {',
    '  import { InternalEventEmitter } from "events";',
    "  export class Readable {}",
    "  export interface Readable extends InternalEventEmitter<{ message: [value: any] }> {}",
    "}",
  ].join("\n"),
  "node_modules/@types/node/async_hooks.d.ts": [
    'declare module "async_hooks" {',
    "  export class AsyncLocalStorage<T> { run<R>(store: T, callback: () => R): R; getStore(): T | undefined; }",
    "}",
  ].join("\n"),
};

/** A minimal zod at zod's own path: object schemas that keep their keys and their `shape`, `z.ZodType` for `satisfies`,
 *  `extend`, unions, `lazy`, the validators, a transform, a default and an optional key. */
export const ZOD_MODULE = {
  "node_modules/zod/package.json": JSON.stringify({ name: "zod", types: "index.d.ts" }),
  // zod's declarations sit under a nested scope manifest that names no package, as the installed zod's do
  "node_modules/zod/index.d.ts": 'export * from "./v4/classic/index.js";',
  "node_modules/zod/v4/classic/package.json": JSON.stringify({ type: "module" }),
  "node_modules/zod/v4/classic/index.d.ts": [
    "type Shape<S> = { [K in keyof S]: S[K] extends Schema<infer V> ? V : never };",
    "export interface Params { readonly error?: string }",
    // `I` is the input parse takes, which a transform keeps while it changes the output
    "export interface Schema<T = unknown, I = T> {",
    "  readonly _output: T;",
    "  readonly _input: I;",
    "  parse(value: unknown): T;",
    "  safeParse(value: unknown): { readonly success: boolean; readonly data?: T };",
    "  parseAsync(value: unknown): Promise<T>;",
    "  safeParseAsync(value: unknown): Promise<{ readonly success: boolean; readonly data?: T }>;",
    "  transform<U>(change: (value: T) => U): Schema<U, I>;",
    // zod types a refinement and a default by the schema's own output, `this`, never by its type parameter
    "  refine(check: (value: this['_output']) => boolean, params?: Params): Schema<T>;",
    // zod's util.Extend: a key the extension names replaces the base's
    "  extend<S>(shape: S): Schema<{ [K in keyof T as K extends keyof S ? never : K]: T[K] } & Shape<S>>;",
    "  default(value: Exclude<this['_output'], undefined>): Schema<T>;",
    "  optional(): Schema<T | undefined>;",
    "  transform<U>(make: (value: T) => U): Schema<U>;",
    "}",
    "export type ZodType<T = unknown> = Schema<T>;",
    "export declare namespace z {",
    "  type ZodType<T = unknown> = Schema<T>;",
    "  type infer<S> = S extends Schema<infer T> ? T : never;",
    "}",
    "export declare const z: {",
    "  object<S>(shape: S, params?: Params): Schema<Shape<S>> & { readonly shape: S };",
    "  strictObject<S>(shape: S, params?: Params): Schema<Shape<S>> & { readonly shape: S };",
    "  union<A extends readonly Schema[]>(arms: A): Schema<A[number]['_output']>;",
    "  discriminatedUnion<A extends readonly Schema[]>(key: string, arms: A): Schema<A[number]['_output']>;",
    "  lazy<T>(make: () => Schema<T>): Schema<T>;",
    "  enum<const T extends readonly string[]>(values: T): Schema<T[number]> & { readonly enum: { readonly [K in T[number]]: K } };",
    "  string(): Schema<string>;",
    "  number(): Schema<number>;",
    "  array<S extends Schema>(item: S): Schema<S['_output'][]>;",
    "  record<K extends Schema<string>, V extends Schema>(key: K, value: V): Schema<Record<K['_output'], V['_output']>>;",
    "  map<K extends Schema, V extends Schema>(key: K, value: V): Schema<Map<K['_output'], V['_output']>>;",
    "};",
  ].join("\n"),
};

/** A library at `node_modules/<name>`, `lib` unless a case models a package the graph confirms by name: its
 *  declarations are outside the tree, so a slot it types is a receiver. */
export const libraryModule = (lines: readonly string[], name = "lib"): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, types: "index.d.ts" }),
  [`node_modules/${name}/index.d.ts`]: lines.join("\n"),
});

/** drizzle-orm's write builders in miniature: `values` takes a slot of the library's own mapped type. */
export const STORE_PACKAGE = "drizzle-orm";
export const STORES = libraryModule(
  [
    "export interface Column { readonly name: string }",
    "export declare const text: () => Column;",
    "export interface TableConfig<C> { readonly columns: C }",
    'export interface Table<T extends TableConfig<unknown>> { readonly _: T; readonly $inferSelect: { [K in keyof T["columns"]]: string } }',
    "export declare function sqliteTable<C>(name: string, columns: C, extra?: (table: C) => readonly unknown[]): Table<TableConfig<C>> & C;",
    'export type Insert<T> = T extends Table<infer Config> ? { [K in keyof Config["columns"] as K & string]?: unknown } : never;',
    "export declare const db: { insert<T>(table: T): { values(value: Insert<T>): Promise<void> } };",
  ],
  STORE_PACKAGE,
);
/** Hono's request context with Node's types: `json` answers the platform `Response`, as the real member does, and `set`
 *  answers nothing. A planted source declares `c: Context` to send through it. */
export const HONO_CONTEXT = {
  ...NODE_TYPES,
  ...libraryModule(
    [
      '/// <reference types="node" />',
      "export declare class Context { json<T>(object: T): Response & { readonly typed: T }; set(key: string, value: object): void }",
    ],
    "hono",
  ),
};

// The ui package owns tailwind-variants; a planted tree takes the installed declarations whole, since the variant pass
// follows a selection through tailwind-variants' own prop types.
const UI_MANIFEST = join(import.meta.dirname, "../../../packages/ui/package.json");
const TV_PACKAGE = "tailwind-variants";
const TV_DIST = "dist";
const DECLARATION = ".d.ts";

/** The installed tailwind-variants declarations at `node_modules/tailwind-variants`. */
export function tailwindVariants(): Record<string, string> {
  const dist = dirname(createRequire(UI_MANIFEST).resolve(TV_PACKAGE));
  const at = `node_modules/${TV_PACKAGE}`;
  const declarations = readdirSync(dist).filter((name) => name.endsWith(DECLARATION));
  return {
    [`${at}/package.json`]: JSON.stringify({ name: TV_PACKAGE, types: `${TV_DIST}/index.d.ts` }),
    ...Object.fromEntries(declarations.map((name) => [`${at}/${TV_DIST}/${name}`, readFileSync(join(dist, name), "utf8")])),
  };
}

// The server package owns hono; the route pass recognises a route and a parameter read by hono's own declarations.
const SERVER_MANIFEST = join(import.meta.dirname, "../../../packages/server/package.json");
const HONO_PACKAGE = "hono";
const HONO_TYPES = "dist/types";

/** The installed hono declarations at `node_modules/hono`. */
export function hono(): Record<string, string> {
  // hono's exports map hides its package.json, so its folder is read off the module it resolves to
  const entry = createRequire(SERVER_MANIFEST).resolve(HONO_PACKAGE);
  const folder = `${sep}node_modules${sep}${HONO_PACKAGE}${sep}`;
  const types = join(entry.slice(0, entry.lastIndexOf(folder) + folder.length), HONO_TYPES);
  const at = `node_modules/${HONO_PACKAGE}`;
  const declarations = readdirSync(types, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(DECLARATION));
  return {
    [`${at}/package.json`]: JSON.stringify({ name: HONO_PACKAGE, types: `${HONO_TYPES}/index.d.ts` }),
    ...Object.fromEntries(declarations.map((name) => [`${at}/${HONO_TYPES}/${name}`, readFileSync(join(types, name), "utf8")])),
  };
}

const TAILWIND = "tailwindcss";
const TAILWIND_SHEETS = ["theme.css", "preflight.css"] as const;

/** tailwindcss at `node_modules/tailwindcss`: a module that re-exports the installed one, beside copies of the sheets
 *  the css pass reads, so the analysed tree's design system is the real one. */
export function tailwindcss(): Record<string, string> {
  const require = createRequire(UI_MANIFEST);
  const at = `node_modules/${TAILWIND}`;
  const exports: Record<string, string> = {
    ".": "./index.mjs",
    ...Object.fromEntries(TAILWIND_SHEETS.map((sheet): [string, string] => [`./${sheet}`, `./${sheet}`])),
  };
  return {
    [`${at}/package.json`]: JSON.stringify({ name: TAILWIND, type: "module", exports }),
    [`${at}/index.mjs`]: `export * from ${JSON.stringify(pathToFileURL(require.resolve(TAILWIND)).href.replace(/\.js$/u, ".mjs"))};`,
    ...Object.fromEntries(TAILWIND_SHEETS.map((sheet) => [`${at}/${sheet}`, readFileSync(require.resolve(`${TAILWIND}/${sheet}`), "utf8")])),
  };
}
