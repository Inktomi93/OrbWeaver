// A Drizzle row's members carry no declaration of their own: a read of one finds its column through the row's table,
// matched by the whole set of column names, whether the row was annotated, selected whole or destructured.
import { expect, test } from "@orb/testkit/tooling";
import { FRESH_BUILD, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, libraryModule } from "./_planted.ts";

const SCHEMA = "packages/db/src/schema/tables.ts";
const FILE = `${GRAPH_SOURCE}/rows.ts`;

// drizzle-orm's typing in miniature: a table keeps its column members, and its select row is a mapped type over them
const DRIZZLE = libraryModule([
  "export interface Column { readonly name: string }",
  "export declare const text: () => Column;",
  "export interface TableConfig<C> { readonly columns: C }",
  "export type Simplify<T> = { [K in keyof T]: T[K] } & {};",
  'export interface Table<T extends TableConfig<unknown>> { readonly _: T; readonly $inferSelect: Simplify<{ [K in keyof T["columns"] & string]: string }> }',
  "export declare function sqliteTable<C>(name: string, columns: C): Table<TableConfig<C>> & C;",
  'export declare const db: { select(): { from<T extends { readonly $inferSelect: unknown }>(table: T): T["$inferSelect"][] } };',
]);

const tables = [
  'import { sqliteTable, text } from "lib";',
  'export const notes = sqliteTable("notes", { id: text(), title: text(), body: text() });',
  'export const cards = sqliteTable("cards", { id: text(), blurb: text() });',
].join("\n");

test("a row member read finds its table's column by the row's whole name set, annotated or selected whole", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...DRIZZLE,
    [SCHEMA]: tables,
    [FILE]: [
      'import { db } from "lib";',
      'import { cards, notes } from "../../db/src/schema/tables.ts";',
      "type Note = typeof notes.$inferSelect;",
      "export const titleOf = (note: Note): string => note.title;",
      'export const firstId = (): string => db.select().from(notes)[0]?.id ?? "";',
      'export const blurb = (): string => db.select().from(cards)[0]?.blurb ?? "";',
    ].join("\n"),
  });
  // a read the type walk cannot place lands here; each of these rows' reads must reach its column instead
  expect(scan.lostReads).toEqual([]);
});

// A store is read as Drizzle's only where its builder methods resolve to this package's declarations.
const STORE_PACKAGE = "drizzle-orm";

// drizzle-orm's write builders in miniature: a stored value's slot is the library's own mapped type, keyed by a remap
// over the columns, as InferInsertModel is, so the slot declares no member of ours.
const STORES = libraryModule(
  [
    "export interface Column { readonly name: string }",
    "export declare const text: () => Column;",
    "export declare const index: (column: Column) => unknown;",
    "export interface TableConfig<C> { readonly columns: C }",
    "export type Simplify<T> = { [K in keyof T]: T[K] } & {};",
    'export interface Table<T extends TableConfig<unknown>> { readonly _: T; readonly $inferSelect: Simplify<{ [K in keyof T["columns"] & string]: string }>; readonly $selected: { [K in keyof T["columns"]]: string } }',
    "export declare function sqliteTable<C>(name: string, columns: C, extra?: (table: C) => readonly unknown[]): Table<TableConfig<C>> & C;",
    // a whole-row query's rows keep the columns' declarations, as drizzle's select result does; `$inferSelect` remaps them away
    'export declare function findMany<T extends { readonly $selected: unknown }>(table: T): Promise<T["$selected"][]>;',
    'export type Insert<T> = T extends Table<infer Config> ? { [K in keyof Config["columns"] as K & string]?: unknown } : never;',
    "export interface Conflict<T> { readonly target: unknown; readonly set: Insert<T> }",
    "export interface Stored<T> { onConflictDoUpdate(config: Conflict<T>): Promise<void> }",
    "export declare const db: {",
    '  select(): { from<T extends { readonly $inferSelect: unknown }>(table: T): T["$inferSelect"][] };',
    "  insert<T>(table: T): { values(value: Insert<T> | readonly Insert<T>[]): Stored<T> };",
    "  update<T>(table: T): { set(value: Insert<T>): Promise<void> };",
    "};",
  ],
  STORE_PACKAGE,
);

const STORED_TABLES = [
  `import { index, sqliteTable, text } from "${STORE_PACKAGE}";`,
  'export const notes = sqliteTable("notes", { id: text(), title: text(), body: text() });',
  'export const cards = sqliteTable("cards", { id: text(), blurb: text() }, (table) => [index(table.blurb)]);',
].join("\n");

const STORE_LINES = [
  `import { db } from "${STORE_PACKAGE}";`,
  'import { cards, notes } from "../../db/src/schema/tables.ts";',
  "export interface NoteWrite { readonly title: string; readonly body: string }",
  "export interface Stamp { readonly at: string; readonly by: string; readonly id: string }",
  "export const store = (write: NoteWrite): Promise<void> => db.insert(notes).values(write).onConflictDoUpdate({ target: notes.id, set: write });",
  "export const stamp = (value: Stamp): Promise<void> => db.update(cards).set({ blurb: value.at ?? value.by, id: value.id });",
  "export const stamped = stamp({",
  "  // the key's own line follows this comment",
  '  at: "a", by: "b", id: "i" });',
  'export const saved = store({ title: "t", body: "b" });',
  'export const titles = (): string => db.select().from(notes)[0]?.title ?? "";',
  'export const ids = (): string => db.select().from(cards)[0]?.id ?? "";',
];

// A Drizzle write hands each value to its column, so a member is read only when its column is read back: a whole value
// pairs its members with the same-named columns, a copied read (through `??`) hands its member on, and a column read
// that only defines an index reads nothing.
test("a member stored into a column is read only where the column is read back in the product", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...STORES,
    [SCHEMA]: STORED_TABLES,
    [FILE]: STORE_LINES.join("\n"),
  });
  // the key sits after a comment line, so a line taken from the key's leading trivia would name the line above it
  const stampLine = STORE_LINES.findIndex((line) => line.trimStart().startsWith('at: "a"')) + 1;
  expect(scan.members.unwired.map(({ key, bucket, note }) => [key.slice(FILE.length + 1), bucket, note])).toEqual([
    ["NoteWrite.body", "member-write-only", `written at ${FILE}:${String(STORE_LINES.length - 2)}`],
    ["Stamp.at", "member-write-only", `written at ${FILE}:${String(stampLine)}`],
    ["Stamp.by", "member-write-only", `written at ${FILE}:${String(stampLine)}`],
  ]);
});

// A role the carry gives names the occurrence that gave it first: a stored member's read is the column's read back, at
// the read's own line, and the record names the column it came through.
test("why names a column-carried read at the read back of the column", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ ...STORES, [SCHEMA]: STORED_TABLES, [FILE]: STORE_LINES.join("\n") }));
  const scan = await scanGraph(root, () => undefined, { ...FRESH_BUILD, why: [{ kind: "member", owner: "NoteWrite", name: "title" }] });
  const readBack = STORE_LINES.findIndex((line) => line.startsWith("export const titles")) + 1;
  const column = STORED_TABLES.split("\n").findIndex((line) => line.includes('sqliteTable("notes"')) + 1;
  expect(scan.session.why.filter(({ role }) => role === "read").map(({ site, via }) => [site, via])).toEqual([
    [`${FILE}:${String(readBack)}`, `carry column from ${SCHEMA}:${String(column)}`],
  ]);
});

// A whole-row query reads no column: each column goes to the row's same-named member, and a row handed to a slot typed
// by the table's row type hands each member on, so a column is read only where product code reads that member.
test("a whole row handed to a row-typed slot reads only the columns the slot's holder reads", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...STORES,
    [SCHEMA]: STORED_TABLES,
    [FILE]: [
      `import { db, findMany } from "${STORE_PACKAGE}";`,
      'import { notes } from "../../db/src/schema/tables.ts";',
      "export interface NoteWrite { readonly id: string; readonly title: string; readonly body: string }",
      "export const store = (write: NoteWrite): Promise<void> => db.insert(notes).values(write).onConflictDoUpdate({ target: notes.id, set: write });",
      'export const saved = store({ id: "i", title: "t", body: "b" });',
      "type Note = typeof notes.$inferSelect;",
      "const titleOf = (note: Note): string => note.title;",
      "export const titles = async (): Promise<string[]> => (await findMany(notes)).map(titleOf);",
      "export const ids = async (): Promise<string[]> => (await findMany(notes)).map((note) => note.id);",
    ].join("\n"),
  });
  expect(scan.members.unwired.map(({ key, bucket }) => [key.slice(FILE.length + 1), bucket])).toEqual([["NoteWrite.body", "member-write-only"]]);
});

// drizzle-orm's JSON column in miniature: the select row types the column by the value type it was declared with.
const JSON_COLUMNS = libraryModule(
  [
    "export interface Column { readonly name: string }",
    "export interface Json<T> extends Column { readonly json: T }",
    "export declare const text: () => Column;",
    "export declare const json: <T>() => Json<T>;",
    "export interface TableConfig<C> { readonly columns: C }",
    'export interface Table<T extends TableConfig<unknown>> { readonly _: T; readonly $inferSelect: { [K in keyof T["columns"] & string]: T["columns"][K] extends Json<infer V> ? V : string } }',
    "export declare function sqliteTable<C>(name: string, columns: C): Table<TableConfig<C>> & C;",
    "export declare const db: {",
    '  select(): { from<T extends { readonly $inferSelect: unknown }>(table: T): T["$inferSelect"][] };',
    "  insert<T>(table: T): { values(value: unknown): void };",
    "};",
  ],
  STORE_PACKAGE,
);

// A whole row serialized out of the process sends each column it carries, and a JSON column's value all the way down,
// so the trace members stored there are sent, not only written.
test("a whole row sent out sends its columns and a JSON column's declared members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...JSON_COLUMNS,
    [SCHEMA]: [
      `import { json, sqliteTable, text } from "${STORE_PACKAGE}";`,
      'import type { Trace } from "../../../a/src/trace.ts";',
      'export const snaps = sqliteTable("snaps", { id: text(), snapshot: json<Trace>() });',
    ].join("\n"),
    [`${GRAPH_SOURCE}/trace.ts`]: "export interface Trace { readonly dropped: readonly { readonly id: string }[] }",
    [FILE]: [
      `import { db } from "${STORE_PACKAGE}";`,
      'import { snaps } from "../../db/src/schema/tables.ts";',
      'import type { Trace } from "./trace.ts";',
      'export const store = (): void => { const snapshot: Trace = { dropped: [{ id: "x" }] }; db.insert(snaps).values({ id: "i", snapshot }); };',
      "export const dump = (): string => JSON.stringify(db.select().from(snaps));",
    ].join("\n"),
  });
  expect(scan.members.unwired.map(({ key, bucket }) => `${key} ${bucket}`)).toEqual([
    `${GRAPH_SOURCE}/trace.ts:Trace.dropped member-sent-only`,
    `${GRAPH_SOURCE}/trace.ts:Trace.dropped.id member-sent-only`,
  ]);
});
