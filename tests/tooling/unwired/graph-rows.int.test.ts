// A Drizzle row's members carry no declaration of their own: a read of one finds its column through the row's table,
// matched by the whole set of column names, whether the row was annotated, selected whole or destructured.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, libraryModule } from "./_planted.ts";

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
