// String keys and built keys the fields query places, one form per case, each with a truly dead twin beside it that
// stays reported; and the reads no walk places, which are listed as unresolved and never credited by their name.
import { expect, test } from "@orb/testkit/tooling";
import { fieldsScan, GRAPH_SOURCE, JSX_NAMESPACE, fieldRows as named } from "./_planted.ts";

const planted = (file: string, lines: readonly string[]): Readonly<Record<string, string>> => ({
  [`${GRAPH_SOURCE}/${file}`]: lines.join("\n"),
});

// Step two: a computed string key names no member the checker walk reaches; find-references places it, so `kept` is
// written. `lost` is read and never written.
const COMPUTED = planted("computed.ts", [
  "export interface Box { readonly kept?: number; readonly spare?: number; readonly lost?: number }",
  'export const box: Box = { ["kept"]: 1, spare: 2 };',
  "export const total = (box.kept ?? 0) + (box.spare ?? 0) + (box.lost ?? 0);",
]);

// A literal that spreads an existing value and overrides one key copies that value: the key is written, but the copy
// builds no home, so a home whose value only arrives from outside keeps its optional fields wired. A literal that
// builds the home from scratch is the control: its unwritten optional field reports.
const copied = (built: readonly string[]): Readonly<Record<string, string>> =>
  planted("copied.ts", [
    "export interface Cfg { readonly mode?: string; readonly port?: string }",
    "declare const raw: unknown;",
    "const cfg = raw as Cfg;",
    'export const copy: Cfg = { ...cfg, ["mode"]: "x" };',
    ...built,
    "export const shown = (cfg.port ?? '') + (copy.mode ?? '');",
  ]);

test("a key that overrides a spread copy writes its member but builds no home", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named((await fieldsScan(plantedTree, copied([]))).unwired, "copied.ts")).toEqual([]);
  expect(named((await fieldsScan(plantedTree, copied(["export const built: Cfg = { mode: 'y' };"]))).unwired, "copied.ts")).toEqual(["Cfg.port never-written"]);
});

test("a computed string key writes the member find-references places it on", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named((await fieldsScan(plantedTree, COMPUTED)).unwired, "computed.ts")).toEqual(["Box.lost never-written"]);
});

// Step four: a key slot declared `keyof Ctx`, as a parameter and as a literal's member, names a member and reads no
// value, so the members only the literal writes stay unread.
const KEYOF = planted("keyof.ts", [
  "export interface Ctx { readonly services: string; readonly auth: string; readonly unused: string }",
  "export const ctx: Ctx = { services: 's', auth: 'a', unused: 'u' };",
  "export const label = (key: keyof Ctx): string => key;",
  "export const shown = label('services');",
  "interface Column { readonly field: keyof Ctx }",
  "export const column: Column = { field: 'auth' };",
  "export const sorted = column.field;",
]);

test("a string key in a keyof slot is a key use, never a read", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named((await fieldsScan(plantedTree, KEYOF)).unwired, "keyof.ts")).toEqual([
    "Ctx.auth never-read",
    "Ctx.services never-read",
    "Ctx.unused never-read",
  ]);
});

// Step five: a generic call's slot `keyof T & string` names the type its `items` argument binds to T, as a fuzzy
// search's field list does: a key use, so only a value read reads a member. The anonymous constraint of the bodyless
// `search` is its own home, filled by the argument and read by nothing.
const GENERIC = planted("generic.ts", [
  "export interface Row { readonly id: string; readonly name: string; readonly gone: string }",
  "export interface SearchOptions<T> { readonly fields: readonly (keyof T & string)[] }",
  "export declare function search<T extends { readonly id: string }>(items: readonly T[], options: SearchOptions<T>): readonly T[];",
  "export const rows: readonly Row[] = [{ id: 'a', name: 'n', gone: 'g' }];",
  "export const ids = search(rows, { fields: ['name'] }).map((row) => row.id);",
  "export const listed = (options: SearchOptions<Row>): number => options.fields.length;",
  "export interface Pair { readonly left: string; readonly right: string }",
  "export declare function pick<T, K extends keyof T>(value: T, key: K): T[K];",
  "export const pair: Pair = { left: 'l', right: 'r' };",
  "export const left = pick(pair, 'left');",
]);

test("a generic call's key slot names the member of the type its argument binds and reads no value", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named((await fieldsScan(plantedTree, GENERIC)).unwired, "generic.ts")).toEqual([
    "Pair.left never-read",
    "Pair.right never-read",
    "Row.gone never-read",
    "Row.name never-read",
    "search.id never-read",
  ]);
});

// Step six: TanStack Form's paths walk the form data type segment by segment. `setFieldValue` writes `params.seed`,
// `getFieldValue` reads it, a `Field` binds `title` (it reads and writes it) and a `getFieldValue` alone reads `note`;
// `params.dead` and `gone` are named by nobody. The default values write `params.fixed`, so a set path taken as a read
// would leave `params.seed` never written.
const FORM = {
  [`${GRAPH_SOURCE}/jsx.d.ts`]: JSX_NAMESPACE,
  [`${GRAPH_SOURCE}/form-api.ts`]: [
    "export interface FieldProps<T> { readonly name: string; readonly children?: unknown; readonly data?: T }",
    "export type ReactFormExtendedApi<TFormData> = {",
    "  setFieldValue(name: string, value: unknown): void;",
    "  getFieldValue(name: string): unknown;",
    "  readonly Field: (props: FieldProps<TFormData>) => JSX.Element;",
    "};",
    "export declare function useForm<T>(options: { readonly defaultValues: T }): ReactFormExtendedApi<T>;",
  ].join("\n"),
  [`${GRAPH_SOURCE}/form.tsx`]: [
    'import { useForm } from "./form-api.ts";',
    "export interface Values { readonly params: { readonly fixed?: number; readonly seed?: number; readonly dead?: number }; readonly title?: string; readonly note?: string; readonly gone?: string }",
    "export function Editor(): JSX.Element {",
    "  const form = useForm<Values>({ defaultValues: { params: { fixed: 1 } } });",
    "  form.setFieldValue('params.seed', 3);",
    "  const seed = [form.getFieldValue('params.seed'), form.getFieldValue('params.fixed'), form.getFieldValue('note')];",
    "  return <form.Field name='title'>{seed}</form.Field>;",
    "}",
  ].join("\n"),
};

test("a form field path reads or writes each member along its segments", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named((await fieldsScan(plantedTree, FORM, { jsx: true })).unwired, "form.tsx")).toEqual([
    "Values.gone unreferenced",
    "Values.note never-written",
    "Values.params.dead unreferenced",
  ]);
});

// A spread of a value whose type builds its keys, `Partial<Record<keyof Delta, number>>`, writes none of them: the type
// names every key and the value holds one. `b` and the key only a bodiless builder's type names stay never written,
// and the builder's own literal key, on a member no declaration backs, is listed as unresolved.
const BUILT = planted("built.ts", [
  "export interface Delta { readonly a?: number; readonly b?: number; readonly modelInSamples?: number }",
  "function build(): Partial<Record<keyof Delta, number>> { return { a: 1 }; }",
  "declare function slice(prefix: 'model'): Partial<Record<'modelInSamples', number>>;",
  "export const seeded: Delta = { a: 2 };",
  "export const delta: Delta = { ...build(), ...slice('model') };",
  "export const read = (delta.a ?? 0) + (delta.b ?? 0) + (delta.modelInSamples ?? 0);",
]);

test("a spread credits only the keys its value was built with", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, BUILT);
  expect(named(report.unwired, "built.ts")).toEqual(["Delta.b never-written", "Delta.modelInSamples never-written"]);
  expect(report.unresolved).toEqual([]);
});

// Step three, second half: a Drizzle select row's member has no declaration and reads the column of the table whose
// column names it holds, so the input copied into `title` is read back; `body` is stored and never selected. The
// store's literal key judges nothing: `note` is stored unselected too, but it also fills a read slot of ours. The graph
// knows a store by drizzle-orm's own declarations, so the stub sits at its package path.
const ROW = {
  "node_modules/drizzle-orm/package.json": JSON.stringify({ name: "drizzle-orm", types: "index.d.ts" }),
  "node_modules/drizzle-orm/index.d.ts": [
    "export declare function sqliteTable<C>(name: string, columns: C): C & { readonly $inferSelect: { [K in Extract<keyof C, string>]: string } };",
    "export declare const text: () => string;",
    "export declare const db: { insert(table: unknown): { values(value: unknown): void } };",
  ].join("\n"),
  "packages/db/src/schema/notes.ts": [
    'import { sqliteTable, text } from "drizzle-orm";',
    'export const notes = sqliteTable("notes", { title: text(), body: text(), note: text() });',
  ].join("\n"),
  [`${GRAPH_SOURCE}/notes.ts`]: [
    'import { db } from "drizzle-orm";',
    'import { notes } from "../../db/src/schema/notes.ts";',
    "export interface NoteInput { readonly title: string; readonly body: string; readonly note: string }",
    "interface Echo { readonly note: string }",
    "const echo = (value: Echo): string => value.note;",
    "export function save(input: NoteInput): string {",
    "  db.insert(notes).values({ title: input.title, body: input.body, note: input.note });",
    "  return echo({ note: input.note });",
    "}",
    "declare const row: typeof notes.$inferSelect;",
    "export const shown = row.title;",
  ].join("\n"),
};

test("a select row's member reads the column its table names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, ROW);
  expect(named(report.unwired, "notes.ts")).toEqual(["NoteInput.body unreferenced"]);
  expect(report.unresolved).toEqual([]);
});

// A read no walk places credits no field. Only a product read off an `any` receiver whose name spells a reported row's
// member, where that row has no read, is listed. A lost read of a mapped member has a receiver type that holds its
// key, so the same name there is not listed.
const UNPLACED = planted("unplaced.ts", [
  "export interface Shape { readonly kept: string; readonly stray?: string }",
  "export const shape = { kept: 'k', loose: 'l' } as Shape;",
  "declare const untyped: any;",
  "declare function make<K extends string>(keys: readonly K[]): { [P in K]: string };",
  "export const read = shape.kept + (untyped.stray as string) + make(['stray']).stray;",
]);

test("a key no step places reports as unresolved and credits no field", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, UNPLACED);
  expect(report.unresolved).toEqual([`${GRAPH_SOURCE}/unplaced.ts:5 stray any-receiver -> Shape.stray`]);
  expect(named(report.unwired, "unplaced.ts")).toEqual(["Shape.stray unreferenced"]);
});
