// A Drizzle row's members carry no declaration of their own: a read of one finds its column through the table the
// checker ties the row's type to, whether the row was annotated, selected whole or destructured.
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import { isPropertyAccessExpression } from "@typescript/native/ast";
import { ROW_COUNTS, rowTablesOf, takeRowTally } from "../../../tooling/src/unwired/drizzle-rows.ts";
import { FRESH_BUILD, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { constituents, NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { GRAPH_SOURCE, graphScan, graphTree, libraryModule, WORLD } from "./_planted.ts";

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

test("a row member read finds the column of the table the checker ties its row type to, annotated or selected whole", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
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

// The installed drizzle-orm, linked into the planted tree, so each row spelling is the checker's real one: a stored
// member is read only where a row spelling the checker ties to its table reads the column back. `notes` and `cards`
// define the same columns, and `Lookalike` spells them with no drizzle type under it: neither may carry a read to
// `notes`. `spare` is never read back, the control that a stored member with no read stays write-only.
const DRIZZLE_DIR = realpathSync(join(import.meta.dirname, "../../../packages/db/node_modules/drizzle-orm"));
const REAL_COLUMNS = ["id", "title", "body", "slug", "mood", "tone", "loaded", "aliased", "texted", "ghost", "echo", "spare"] as const;
const REAL_FILE = `${GRAPH_SOURCE}/real-rows.ts`;

// The planted tree of the real-drizzle cases, with the installed drizzle-orm linked in.
async function realRowsTree(plantedTree: (tree: Record<string, string>) => Promise<string>): Promise<string> {
  const columns = REAL_COLUMNS.map((name) => `${name}: text("${name}")${name === "id" ? ".primaryKey()" : ".notNull()"}`).join(", ");
  const root = await plantedTree(
    graphTree({
      [SCHEMA]: [
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";',
        `export const notes = sqliteTable("notes", { ${columns} });`,
        `export const cards = sqliteTable("cards", { ${columns} });`,
      ].join("\n"),
      [REAL_FILE]: [
        'import type { InferSelectModel } from "drizzle-orm";',
        'import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";',
        'import { cards, notes } from "../../db/src/schema/tables.ts";',
        'declare const db: BaseSQLiteDatabase<"async", unknown>;',
        `export interface NoteWrite { ${REAL_COLUMNS.map((name) => `readonly ${name}: string`).join("; ")} }`,
        "export const store = async (write: NoteWrite): Promise<void> => { await db.insert(notes).values(write); };",
        `export const saved = store({ ${REAL_COLUMNS.map((name) => `${name}: "v"`).join(", ")} });`,
        "type Note = typeof notes.$inferSelect;",
        "type RowOf<T extends { readonly $inferSelect: unknown }> = T['$inferSelect'];",
        "export declare function load(): Promise<Note>;",
        `type Lookalike = Record<${REAL_COLUMNS.map((name) => `"${name}"`).join(" | ")}, string>;`,
        "export const id = async (): Promise<string | undefined> => (await db.select().from(notes))[0]?.id;",
        "export const title = (note: Note): string => note.title;",
        "export const body = (note: InferSelectModel<typeof notes>): string => note.body;",
        "export const slug = (note: Pick<InferSelectModel<typeof notes>, 'slug'>): string => note.slug;",
        "export const mood = (note: Omit<Note, 'id'>): string => note.mood;",
        "export const tone = (note: Partial<Note>): string | undefined => note.tone;",
        "export const loaded = (note: Awaited<ReturnType<typeof load>>): string => note.loaded;",
        "export const aliased = (note: RowOf<typeof notes>): string => note.aliased;",
        // the row is reached only through the conditional's indexed branch: the mapped key set is the resolved literals
        "type JsonField = keyof Pick<Note, 'body'>;",
        "type NoteText = { readonly [Field in keyof Note]: Field extends JsonField ? string | null : Note[Field] };",
        "export const texted = (note: NoteText): string => note.texted;",
        "export const ghost = (look: Lookalike): string => look.ghost;",
        "export const echo = (card: typeof cards.$inferSelect): string => card.echo;",
        "export const picked = async (): Promise<string | undefined> => (await db.select({ id: notes.id }).from(notes))[0]?.id;",
      ].join("\n"),
    }),
  );
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(DRIZZLE_DIR, join(root, "node_modules/drizzle-orm"));
  return root;
}

test("a stored member is read back only through a row type the checker ties to its table, never by matching names", { timeout: 180_000 }, async ({
  plantedTree,
}) => {
  const scan = await scanGraph(await realRowsTree(plantedTree), () => undefined);
  expect({
    unwired: scan.members.unwired.map(({ key, bucket }) => `${key.slice(REAL_FILE.length + 1)} ${bucket}`),
    refused: scan.rowRefusals,
    tied: (scan.counts.find(({ name }) => name === ROW_COUNTS.tied)?.count ?? 0) > 0,
  }).toEqual({
    unwired: ["NoteWrite.ghost member-write-only", "NoteWrite.echo member-write-only", "NoteWrite.spare member-write-only"],
    refused: [`${REAL_FILE}\tLookalike`],
    tied: true,
  });
});

// A partial select's row is drizzle's `SelectResultFields` over the selection, whose template holds a deferred
// conditional: a walk through that conditional's branches mints a deeper indexed access at every level and never ends.
// The tie walks it to its end, ties no table and is cut by no bound; the twin table's row still ties to its own table.
test("a partial select's row ends its tie walk at no table, and a twin table's row ties to its own", { timeout: 180_000 }, async ({ plantedTree }) => {
  using world = NativeWorld.open(await realRowsTree(plantedTree), WORLD);
  const file = world.files.find((planted) => world.siteOf(planted).file === REAL_FILE);
  const receivers: Node[] = [];
  const visit = (node: Node): void => {
    if (isPropertyAccessExpression(node) && ["id", "echo"].includes(node.name.text) && node.getText() !== "notes.id") {
      receivers.push(node.expression);
    }
    node.forEachChild(visit);
  };
  file?.forEachChild(visit);
  const types = world.batch(world.typesAt(receivers).map((type) => constituents(type))).flat();
  const ties = world.batch(types.map((type) => rowTablesOf(world, type)));
  expect({
    tables: [...new Set(ties.map((tied) => tied.map(({ binding }) => binding).join(",")))].toSorted(),
    cut: takeRowTally(world).counts.get(ROW_COUNTS.cut) ?? 0,
  }).toEqual({ tables: ["", "cards", "notes"], cut: 0 });
});
