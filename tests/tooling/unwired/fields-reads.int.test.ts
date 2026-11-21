// Reads and writes the fields scan resolves through the checker where no name joins the site to its member, each with
// a truly dead twin of the same shape beside it that stays reported; and the rows a ruling sorts out of the judged list.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD, ZOD_STUB } from "./_planted.ts";

type Report = ReturnType<typeof scanFields>;
type Rows = Report["unwired"];

const scan = (root: string): Report => scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
const named = (rows: Rows, file: string): string[] =>
  rows
    .filter((entry) => entry.file.endsWith(file))
    .map(({ home, member, kind }) => `${home}.${member} ${kind}`)
    .toSorted();
const planted = (file: string, lines: readonly string[]): Readonly<Record<string, string>> => ({
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/z.ts": ZOD_STUB,
  [`packages/a/src/${file}`]: lines.join("\n"),
});

// tRPC hands a procedure `Simplify<Overwrite<Context, Extra>>`: a mapped type keyed by two `keyof` unions, whose members
// carry no declaration. Each read lands on the Context member its template indexes; `spare` is read by nobody.
const MAPPED_CONTEXT = planted("ctx.ts", [
  "type WithoutIndexSignature<T> = { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };",
  "type Overwrite<T, W> = { [K in keyof WithoutIndexSignature<T> | keyof WithoutIndexSignature<W>]: K extends keyof W ? W[K] : K extends keyof T ? T[K] : never };",
  "type Simplify<T> = { [K in keyof T]: T[K] };",
  "export interface Ctx { readonly services: string; readonly auth: string | null; readonly spare: string }",
  "export const procedure = <C>(resolve: (opts: { readonly ctx: Simplify<Overwrite<C, { auth: string }>> }) => string): ((ctx: C) => string) => (ctx) => resolve({ ctx: ctx as never });",
  'export const makeCtx = (): Ctx => ({ services: "s", auth: "a", spare: "p" });',
  "export const handler = procedure<Ctx>(({ ctx }) => ctx.services + ctx.auth);",
]);

test("a read through a mapped context reads the member its template indexes, and only that one", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(MAPPED_CONTEXT));
  expect(named(report.unwired, "ctx.ts")).toEqual(["Ctx.spare never-read"]);
});

// `TASK_DEFS = defs satisfies Record<Task, TaskFields>`: the compiler holds each row to TaskFields, so an indexed read of a
// row's member reads TaskFields' member. `unread` is written in every row and read by nobody.
const SATISFIED_TABLE = planted("table.ts", [
  'export type Task = "chat" | "embed";',
  'interface TaskFields { readonly scope: "actor" | "owner"; readonly spend: "fg" | "bg"; readonly unread: string }',
  'const defs = { chat: { scope: "actor", spend: "fg", unread: "u" }, embed: { scope: "owner", spend: "bg", unread: "u" } } as const;',
  "export const TASK_DEFS = defs satisfies Record<Task, TaskFields>;",
  'export const owned = (task: Task): boolean => TASK_DEFS[task].scope === "owner" && TASK_DEFS[task].spend === "fg";',
  "export const asType = (task: Task): TaskFields => TASK_DEFS[task];",
]);

test("an indexed read of a table bound under satisfies reads the checked row type's member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(SATISFIED_TABLE));
  expect(named(report.unwired, "table.ts")).toEqual(["TaskFields.unread never-read"]);
});

// The rows spread into an array of a wider union element: a read of `row.off` reads OffEntry's `off`, which flowed in.
const ARRAY_SPREAD = planted("roster.ts", [
  "export interface Entry { readonly name: string }",
  "export interface OffEntry extends Entry { readonly off: string; readonly why: string }",
  'export const offs: readonly OffEntry[] = [{ name: "n", off: "o", why: "w" }];',
  'export const entries: readonly Entry[] = [{ name: "m" }];',
  "const rows: readonly (Entry & { readonly off?: string })[] = [...entries, ...offs];",
  'export const shownRows = rows.map((row) => row.name + (row.off ?? ""));',
]);

test("an array spread hands its elements to the array's element type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(ARRAY_SPREAD));
  expect(named(report.unwired, "roster.ts")).toEqual(["OffEntry.why never-read"]);
});

// `??=` and `+=` store into their member. `dirName` is written only by `??=`; `count` is only ever bumped, so it is
// never read; `label` is read and never written.
const COMPOUND = planted("compound.ts", [
  "export interface Group { dirName?: string; label?: string; count: number }",
  "const group: Group = { count: 0 };",
  'group.dirName ??= "d";',
  "group.count += 1;",
  'export const shownGroup = (group.dirName ?? "") + (group.label ?? "");',
]);

test("a compound or logical assignment writes its member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(COMPOUND));
  expect(named(report.unwired, "compound.ts")).toEqual(["Group.count never-read", "Group.label never-written"]);
});

// A paged query fills its input's cursor from `getNextPageParam`; the same call fills nothing else, so `after` stays
// never written.
const PAGED = planted("paged.ts", [
  'import type { Infer } from "./z.ts";',
  'import { z } from "./z.ts";',
  "export const listInputSchema = z.object({ limit: z.string(), cursor: z.string().optional(), after: z.string().optional() });",
  "type ListInput = Infer<typeof listInputSchema>;",
  'export const list = (input: ListInput): string => input.limit + (input.cursor ?? "") + (input.after ?? "");',
  "interface Procedure<I> {",
  "  infiniteQueryOptions(input: I, options: { readonly getNextPageParam: (page: string) => string }): unknown;",
  "  queryOptions(input: I): unknown;",
  "}",
  "declare const procedure: Procedure<ListInput>;",
  'export const paged = procedure.infiniteQueryOptions({ limit: "10" }, { getNextPageParam: (page) => page });',
  'export const single = procedure.queryOptions({ limit: "1" });',
]);

test("a paged query writes its input's cursor and no other member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(PAGED));
  expect(named(report.unwired, "paged.ts")).toEqual(["listInputSchema.after never-written"]);
});

// A mutation's one-member output is its acknowledgement; a two-member output and a query's output stay judged.
const OUTPUTS = planted("router.ts", [
  'import type { Infer } from "./z.ts";',
  'import { z } from "./z.ts";',
  "interface Builder<S> {",
  "  output<T>(schema: T): Builder<T>;",
  "  mutation(resolve: () => Infer<S>): unknown;",
  "  query(resolve: () => Infer<S>): unknown;",
  "}",
  "declare const procedure: Builder<unknown>;",
  'export const restart = procedure.output(z.object({ restarting: z.string() })).mutation(() => ({ restarting: "yes" }));',
  "export const forkSchema = z.object({ chatId: z.string(), cloned: z.string() });",
  'export const fork = procedure.output(forkSchema).mutation(() => ({ chatId: "c", cloned: "x" }));',
  "export const shownFork = (result: Infer<typeof forkSchema>): string => result.chatId;",
  'export const status = procedure.output(z.object({ up: z.string() })).query(() => ({ up: "u" }));',
]);

test("a never-read one-member mutation output reports as an acknowledgement, apart from the judged rows", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(OUTPUTS));
  expect(named(report.acknowledged, "router.ts")).toEqual(["restart.restarting never-read"]);
  expect(named(report.unwired, "router.ts")).toEqual(["forkSchema.cloned never-read", "status.up never-read"]);
});

// A schema key production neither writes nor reads can only be filled by a parse of outside input: it reports in
// `validated`. An interface member nobody names stays a judged row.
const VALIDATED = planted("wire.ts", [
  'import type { Infer } from "./z.ts";',
  'import { z } from "./z.ts";',
  "export const responseSchema = z.object({ seen: z.string(), unseen: z.string() });",
  "export const seen = (response: Infer<typeof responseSchema>): string => response.seen;",
  "export interface Local { readonly kept: string; readonly gone: string }",
  'export const local: Local = { kept: "k", gone: "g" };',
  "export const kept = local.kept;",
]);

test("a schema key nobody names reports as validated; a type member nobody names stays judged", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(VALIDATED));
  expect(named(report.validated, "wire.ts")).toEqual(["responseSchema.unseen unreferenced"]);
  expect(named(report.unwired, "wire.ts")).toEqual(["Local.gone never-read"]);
});

// The shapes of known dead fields on main: a member the client reads only through another type of the same name, a
// registry row member nobody reads, an optional member read and never written, and a second output member nobody reads.
const KNOWN_DEAD = planted("known.ts", [
  'import type { Infer } from "./z.ts";',
  'import { z } from "./z.ts";',
  "export interface EffectiveEntry { readonly scriptId: string; readonly runsAt: number; readonly name: string }",
  "export interface TierRowView { readonly runsAt: number | null }",
  'export const effective: readonly EffectiveEntry[] = [{ scriptId: "s", runsAt: 1, name: "n" }];',
  "export const names = effective.map((entry) => entry.name);",
  "export const row: TierRowView = { runsAt: null };",
  "export const ranked = row.runsAt !== null;",
  'export type Wire = "a" | "b";',
  "export interface BackendDef { readonly needs: string; readonly serves: readonly string[] }",
  'export const BACKEND_DEFS: Record<Wire, BackendDef> = { a: { needs: "x", serves: ["chat"] }, b: { needs: "y", serves: [] } };',
  "export const needsOf = (wire: Wire): string => BACKEND_DEFS[wire].needs;",
  "export interface WireMeta { readonly role: string; readonly cacheBreakpoint?: boolean }",
  'export const meta: WireMeta = { role: "r" };',
  'export const cached = meta.cacheBreakpoint === true ? meta.role : "";',
  "interface Builder<S> { output<T>(schema: T): Builder<T>; mutation(resolve: () => Infer<S>): unknown }",
  "declare const procedure: Builder<unknown>;",
  "export const forkGameSchema = z.object({ chatId: z.string(), cloned: z.string() });",
  'export const forkGame = procedure.output(forkGameSchema).mutation(() => ({ chatId: "c", cloned: "yes" }));',
  "export const forked = (result: Infer<typeof forkGameSchema>): string => result.chatId;",
]);

test("the shapes of known dead fields stay judged rows", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(KNOWN_DEAD));
  expect(named(report.unwired, "known.ts")).toEqual([
    "BackendDef.serves never-read",
    "EffectiveEntry.runsAt never-read",
    "EffectiveEntry.scriptId never-read",
    "WireMeta.cacheBreakpoint never-written",
    "forkGameSchema.cloned never-read",
  ]);
});

const PUBLISHED = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/published/view.ts": [
    "export interface GuestView { readonly shown: string; readonly forGuests: string }",
    'export const view: GuestView = { shown: "s", forGuests: "g" };',
    "export const shown = view.shown;",
  ].join("\n"),
  "packages/a/src/own/view.ts": [
    "export interface OwnView { readonly shown: string; readonly dropped: string }",
    'export const own: OwnView = { shown: "s", dropped: "d" };',
    "export const ownShown = own.shown;",
  ].join("\n"),
};

test("a directory entry of the deliberate list excuses every home under it and no other", { timeout: 120_000 }, async ({ plantedTree }) => {
  const reason = "read by guests outside the tree";
  const report = scanFields({
    root: await plantedTree(PUBLISHED),
    worlds: [WORLD],
    testWorlds: [],
    deliberate: [{ directory: "packages/a/src/published/", reason }],
    log: () => undefined,
  });
  expect(report.deliberate.map(({ home, member, reason: why }) => `${home}.${member} ${why}`)).toEqual([`GuestView.forGuests ${reason}`]);
  expect(report.unwired.map(({ home, member }) => `${home}.${member}`)).toEqual(["OwnView.dropped"]);
});
