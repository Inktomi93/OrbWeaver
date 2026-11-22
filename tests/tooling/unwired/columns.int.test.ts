// The columns scan over planted Drizzle trees: one case per rule of the columns design, each with a twin of the same
// shape that stays reported. The stub models drizzle's typing: a table's column members keep their declarations, and
// its select and insert rows are mapped types whose members carry none.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanColumns } from "../../../tooling/src/unwired/columns.ts";
import { LIB } from "./_planted.ts";

type Report = ReturnType<typeof scanColumns>;

const ROOT_WORLD = "tsconfig.json";

const scan = (root: string): Report => scanColumns({ root, worlds: [ROOT_WORLD], testWorlds: [], deliberate: [], log: () => undefined });
const named = (report: Report): string[] => report.unwired.map(({ home, member, kind }) => `${home}.${member} ${kind}`).toSorted();

const DRIZZLE = [
  "export interface Column<R extends boolean> { readonly required: R }",
  "export declare const text: () => Column<false>;",
  "export declare const required: () => Column<true>;",
  "type RequiredKeys<C> = { [K in keyof C]: C[K] extends Column<true> ? K : never }[keyof C] & string;",
  "type OptionalKeys<C> = Exclude<Extract<keyof C, string>, RequiredKeys<C>>;",
  "export type Table<C> = C & {",
  "  readonly $inferSelect: { [K in Extract<keyof C, string>]: string };",
  "  readonly $inferInsert: { [K in RequiredKeys<C>]: string } & { [K in OptionalKeys<C>]?: string };",
  "};",
  "export declare function sqliteTable<C>(name: string, columns: C, extra?: (table: C) => readonly unknown[]): Table<C>;",
  "export declare function index(name: string): { on(column: unknown): unknown };",
  "export declare function eq(left: unknown, right: unknown): unknown;",
  "export declare const db: {",
  "  insert(table: unknown): { values(value: unknown): void };",
  "  update(table: unknown): { set(value: unknown): { where(condition: unknown): void } };",
  '  select(): { from<T extends { readonly $inferSelect: unknown }>(table: T): T["$inferSelect"][] };',
  "};",
  "export declare const logger: { info(fields: Record<string, unknown> | string): void };",
  "export declare function writeFileSync(path: string, data: string): void;",
].join("\n");

const tree = (schema: readonly string[], product: readonly string[], extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> => ({
  [ROOT_WORLD]: plantedTsconfig({ lib: LIB, include: ["packages"] }),
  "packages/db/src/drizzle.ts": DRIZZLE,
  "packages/db/src/schema/tables.ts": ['import { index, required, sqliteTable, text } from "../drizzle.ts";', ...schema].join("\n"),
  "packages/a/src/product.ts": [
    'import { db, eq, logger, writeFileSync } from "../../db/src/drizzle.ts";',
    'import * as schema from "../../db/src/schema/tables.ts";',
    ...product,
  ].join("\n"),
  ...extra,
});

// A select with no column list reads a column only where production reads the row's member: directly, or through the
// declared shape the whole row is handed to. `notes.body` and `cards.blurb` ride every row and nobody reads them.
const WHOLE_SELECT = tree(
  [
    'export const notes = sqliteTable("notes", { title: text(), body: text() });',
    'export const cards = sqliteTable("cards", { name: text(), blurb: text() });',
  ],
  [
    'export const save = (): void => { db.insert(schema.notes).values({ title: "t", body: "b" }); db.insert(schema.cards).values({ name: "n", blurb: "b" }); };',
    "export const titles = db.select().from(schema.notes).map((row) => row.title);",
    "interface CardView { readonly name: string; readonly blurb: string }",
    "function list(): readonly CardView[] { return db.select().from(schema.cards); }",
    "export const names = list().map((card) => card.name);",
  ],
);

test("a whole-row select reads only the columns production reads by member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(WHOLE_SELECT));
  expect(named(report)).toEqual(["cards.blurb never-read", "notes.body never-read"]);
  expect(report.columns.find(({ key }) => key.endsWith("cards.name"))).toMatchObject({ reads: 1, writes: 1 });
});

// The schema file's own index and the relations file's reference are no read, and a migration is SQL no program holds:
// `slug` is named only there. `kind` has the same shape and one production read.
const SCHEMA_SITES = tree(
  ['export const tags = sqliteTable("tags", { slug: text(), kind: text() }, (table) => [index("tags_slug").on(table.slug)]);'],
  [
    'export const write = (): void => { db.insert(schema.tags).values({ slug: "s", kind: "k" }); };',
    "export const kinds = db.select().from(schema.tags).map((row) => row.kind);",
  ],
  {
    "packages/db/src/schema/relations.ts": 'import { tags } from "./tables.ts";\nexport const tagRelations = { fields: [tags.slug] };',
    "packages/db/src/migrations/0000_baseline.sql": "CREATE TABLE tags (slug text, kind text);\nSELECT slug FROM tags;",
  },
);

test("schema files and migrations neither read nor write a column", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(SCHEMA_SITES));
  expect(named(report)).toEqual(["tags.slug never-read"]);
});

// A column picked by name into a log is read; a whole row handed to the logger, shorthand or serialized, reads nothing,
// so `detail` stays never read.
const LOGGED = tree(
  ['export const events = sqliteTable("events", { label: text(), detail: text() });'],
  [
    'export const record = (): void => { db.insert(schema.events).values({ label: "l", detail: "d" }); };',
    "export const trace = (): void => {",
    "  for (const row of db.select().from(schema.events)) {",
    "    logger.info({ label: row.label });",
    "    logger.info({ row });",
    "    logger.info(JSON.stringify(row));",
    "  }",
    "};",
  ],
);

test("a column logged by name is read and a whole-row log dump reads none", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(LOGGED));
  expect(named(report)).toEqual(["events.detail never-read"]);
});

// An export serializes whole rows into a file, which reads every column they carry; the same rows serialized into a log
// read none, so `archive.summary` stays never read. A store of a whole value writes its required members' columns: the
// import fills `profiles.name` and `bio`. An optional column only the value's type allows is no write, so `motto`,
// which the imported value never carries, stays never written, as `archive.extra` does under an insert-typed draft.
const PORTED = tree(
  [
    'export const profiles = sqliteTable("profiles", { name: required(), bio: required(), motto: text() });',
    'export const archive = sqliteTable("archive", { title: required(), summary: required(), extra: text() });',
  ],
  [
    "interface ImportedProfile { readonly name: string; readonly bio: string; readonly motto?: string }",
    "export const importProfile = (text: string): void => { db.insert(schema.profiles).values(JSON.parse(text) as ImportedProfile); };",
    "export const exportProfiles = (path: string): void => { writeFileSync(path, JSON.stringify(db.select().from(schema.profiles))); };",
    "export const archived = (draft: typeof schema.archive.$inferInsert): void => { db.insert(schema.archive).values(draft); };",
    "export const dump = (): void => { logger.info(JSON.stringify(db.select().from(schema.archive))); };",
  ],
);

test("an export to a file reads its columns and an import writes the required ones", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(PORTED));
  expect(named(report)).toEqual(["archive.extra unreferenced", "archive.summary never-read", "archive.title never-read", "profiles.motto never-written"]);
});

// A filter and an update name a column through the table: `eq(table.col, v)` reads it and `.set({ col })` writes it.
// `hidden` is never named outside its table.
const FILTERED = tree(
  ['export const users = sqliteTable("users", { email: text(), hidden: text() });'],
  ['export const rename = (email: string): void => { db.update(schema.users).set({ email }).where(eq(schema.users.email, "old")); };'],
);

test("a filter reads its column and an update writes it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(FILTERED));
  expect(named(report)).toEqual(["users.hidden unreferenced"]);
  expect(report.columns.find(({ key }) => key.endsWith("users.email"))).toMatchObject({ reads: 1, writes: 1 });
});
