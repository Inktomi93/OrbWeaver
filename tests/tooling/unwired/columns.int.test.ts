// The columns scan over planted Drizzle trees: one case per rule of the columns design, each with a twin of the same
// shape that stays reported. The stub models drizzle's typing: a table's column members keep their declarations, and
// its select and insert rows are mapped types whose members carry none.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { runUnwired, scanColumns, scanFields } from "../../../tooling/src/unwired/index.ts";
import { JUDGED_WORK, judgedExpected, judgedOutcome, LIB, plantJudged, WORLD } from "./_planted.ts";

type Report = ReturnType<typeof scanColumns>;

const ROOT_WORLD = "tsconfig.json";

const scan = (root: string): Report => scanColumns({ root, worlds: [ROOT_WORLD], testWorlds: [], deliberate: [], log: () => undefined });
const named = (report: Report): string[] => report.unwired.map(({ home, member, kind }) => `${home}.${member} ${kind}`).toSorted();

const DRIZZLE = [
  "export interface Column<R extends boolean> { readonly required: R; primaryKey(): Column<R> }",
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
  "export declare function primaryKey(options: { readonly columns: readonly unknown[] }): unknown;",
  "export declare function eq(left: unknown, right: unknown): unknown;",
  "export declare const db: {",
  "  insert(table: unknown): { values(value: unknown): void };",
  "  update(table: unknown): { set(value: unknown): { where(condition: unknown): void } };",
  '  select(): { from<T extends { readonly $inferSelect: unknown }>(table: T): T["$inferSelect"][] };',
  "};",
  "export declare const rawDb: { run(statement: unknown): void };",
  "export declare function sql(text: TemplateStringsArray, ...values: unknown[]): unknown;",
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

// A store whose value is typed by a mapped subset of the row, `Omit<>`, `Pick<>` or `Partial<>`, writes each column the
// construction sets: `cap` and `max`. `note` and `min` are allowed and never set, so they stay never written. A
// member no step places that is named as a column is listed as unresolved; one named as no column is not.
const SUBSET_STORE = tree(
  [
    'export const invites = sqliteTable("invites", { id: required(), cap: text(), note: text() });',
    'export const budgets = sqliteTable("budgets", { owner: required(), max: text(), min: text() });',
  ],
  [
    'type Draft = Omit<typeof schema.invites.$inferInsert, "id">;',
    'const insertInvite = (row: Draft): void => { db.insert(schema.invites).values({ ...row, id: "x" }); };',
    "export const mint = (cap: string): void => { insertInvite({ cap }); };",
    'type BudgetPatch = Partial<Pick<typeof schema.budgets.$inferSelect, "max" | "min">>;',
    'const patchBudget = (patch: BudgetPatch): void => { db.update(schema.budgets).set(patch).where(eq(schema.budgets.owner, "o")); };',
    'export const raise = (): void => { patchBudget({ max: "9" }); db.insert(schema.budgets).values({ owner: "o" }); };',
    "export const shown = db.select().from(schema.invites).map((row) => [row.id, row.cap, row.note]);",
    "export const limits = db.select().from(schema.budgets).map((row) => [row.max, row.min]);",
    'declare const loose: { [K in "note" | "other"]: string };',
    "export const stray = loose.note + loose.other;",
  ],
);

test("a store typed by a mapped subset of the row writes the columns its construction sets", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(SUBSET_STORE));
  expect(named(report)).toEqual(["budgets.min never-written", "invites.note never-written"]);
  expect(report.unresolved).toEqual(["packages/a/src/product.ts:12 note"]);
});

// drizzle's own typing: the select row maps each column's own type, whose `name` and `dialect` are the library
// column's members, so a read of `row.name` must still read the table's column. `spare` is read by nobody.
const DRIZZLE_ORM = join(import.meta.dirname, "../../../packages/db/node_modules/drizzle-orm");
const REAL_TYPING = {
  [ROOT_WORLD]: plantedTsconfig({
    lib: LIB,
    include: ["packages"],
    paths: { "drizzle-orm/sqlite-core": [join(DRIZZLE_ORM, "sqlite-core/index.d.ts")], "drizzle-orm": [join(DRIZZLE_ORM, "index.d.ts")] },
  }),
  "packages/db/src/schema/rules.ts": [
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";',
    'export const rules = sqliteTable("rules", { id: text("id").primaryKey(), name: text("name").notNull(), dialect: text("dialect"), spare: text("spare") });',
  ].join("\n"),
  "packages/a/src/rules.ts": [
    'import { rules } from "../../db/src/schema/rules.ts";',
    "type RuleRow = typeof rules.$inferSelect;",
    "export const shown = (row: RuleRow): readonly unknown[] => [row.id, row.name, row.dialect === null];",
  ].join("\n"),
};

test("a whole-row read of a column named like a library column member reads the table's column", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(REAL_TYPING));
  expect(named(report)).toEqual(["rules.dialect never-written", "rules.id never-written", "rules.name never-written", "rules.spare unreferenced"]);
});

// The fields scan: a row handed whole to a declared shape carries reads up to its columns and nothing down, so a read of
// the column on another row credits no member of the shape. Nobody reads RunView, so both members stay unreferenced.
const ROW_VIEW = {
  [WORLD]: plantedTsconfig({ lib: LIB, include: ["src", "../db/src"] }),
  "packages/db/src/drizzle.ts": DRIZZLE,
  "packages/db/src/schema/tables.ts": 'import { sqliteTable, text } from "../drizzle.ts";\nexport const runs = sqliteTable("runs", { a: text(), b: text() });',
  "packages/a/src/views.ts": [
    'import { db } from "../../db/src/drizzle.ts";',
    'import { runs } from "../../db/src/schema/tables.ts";',
    "export interface RunView { readonly a: string; readonly b: string }",
    "export function views(): RunView[] { return db.select().from(runs); }",
    "export const raw = db.select().from(runs).map((r) => r.b);",
  ].join("\n"),
};

test("a column read never credits the shape its row is handed to", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scanFields({ root: await plantedTree(ROW_VIEW), worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.filter(({ home }) => home === "RunView").map(({ member, kind }) => `${member} ${kind}`)).toEqual(["a unreferenced", "b unreferenced"]);
});

// A zod parse's output type names the keys it copies out of its argument; a safe parse answers them on `data`.
const ZOD = {
  "node_modules/zod/package.json": JSON.stringify({ name: "zod", types: "index.d.ts" }),
  "node_modules/zod/index.d.ts": [
    "export interface ZodType<O> {",
    "  parse(input: unknown): O;",
    "  safeParse(input: unknown): { readonly success: true; readonly data: O } | { readonly success: false; readonly error: Error };",
    "}",
    "export declare function object<S extends Record<string, ZodType<unknown>>>(shape: S): ZodType<{ [K in keyof S]: S[K] extends ZodType<infer V> ? V : never }>;",
    "export declare function string(): ZodType<string>;",
  ].join("\n"),
};

// A zod parse of a selected row reads the columns its output names, whole or spread into the argument: `obs.model` and
// `tokens` through a spread, `calls.task` through a safe parse. `obs.ttft` is set over the spread, `calls.wire` the
// schema does not name, and `calls.cost` only reaches a parse no zod schema answers, so all three stay never read.
const SPREAD_PARSE = tree(
  [
    'export const obs = sqliteTable("obs", { model: text(), tokens: text(), ttft: text(), funder: text() });',
    'export const calls = sqliteTable("calls", { task: text(), cost: text(), wire: text() });',
  ],
  [
    'import * as z from "zod";',
    'export const save = (): void => { db.insert(schema.obs).values({ model: "m", tokens: "1", ttft: "2", funder: "f" }); db.insert(schema.calls).values({ task: "t", cost: "c", wire: "w" }); };',
    "const legSchema = z.object({ model: z.string(), tokens: z.string(), ttft: z.string() });",
    'export const legs = db.select().from(schema.obs).map((row) => ({ leg: legSchema.parse({ ...row, ttft: "0" }), funder: row.funder }));',
    "const callSchema = z.object({ task: z.string() });",
    "export const tasks = db.select().from(schema.calls).map((row) => callSchema.safeParse(row).data);",
    "const local = { parse: (value: unknown): { readonly cost: string } => ({ cost: String(value) }) };",
    "export const costs = db.select().from(schema.calls).map((row) => local.parse(row));",
  ],
  ZOD,
);

test("a zod parse of a row reads the columns its output names and no other", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(SPREAD_PARSE));
  expect(named(report)).toEqual(["calls.cost never-read", "calls.wire never-read", "obs.ttft never-read"]);
});

// A primary key is the row's identity, which an upsert on a natural key never selects: an inline `.primaryKey()` and the
// columns a `primaryKey({ columns })` lists are reported apart. `pairs.note`, a plain column with the same uses, stays.
const PRIMARY_KEYS = tree(
  [
    'import { primaryKey } from "../drizzle.ts";',
    'export const stats = sqliteTable("stats", { id: text().primaryKey(), total: text() });',
    'export const pairs = sqliteTable("pairs", { left: text(), right: text(), note: text() }, (table) => [primaryKey({ columns: [table.left, table.right] })]);',
  ],
  [
    'export const save = (): void => { db.insert(schema.stats).values({ id: "i", total: "t" }); db.insert(schema.pairs).values({ left: "l", right: "r", note: "n" }); };',
    "export const totals = db.select().from(schema.stats).map((row) => row.total);",
  ],
);

test("a primary-key column production never reads is reported apart from the unwired columns", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(PRIMARY_KEYS));
  expect(named(report)).toEqual(["pairs.note never-read"]);
  expect(report.primaryKeys.map(({ home, member, kind }) => `${home}.${member} ${kind}`).toSorted()).toEqual([
    "pairs.left never-read",
    "pairs.right never-read",
    "stats.id never-read",
  ]);
});

// The verb's own door with the shipped deliberate list: plugin-kv's raw INSERT is the only writer of `pluginId`,
// `ownerId` and `key`, which list as deliberate with their reason. `stray` has the same shape and stays reported.
const RAW_SQL = {
  "packages/db/tsconfig.json": plantedTsconfig({ lib: LIB }),
  "packages/db/src/drizzle.ts": DRIZZLE,
  "packages/db/src/schema/plugin.ts": [
    'import { sqliteTable, text } from "../drizzle.ts";',
    'export const pluginKv = sqliteTable("plugin_kv", { pluginId: text(), ownerId: text(), key: text(), value: text(), stray: text() });',
  ].join("\n"),
  "packages/server/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["src", "../db/src"] }),
  "packages/server/src/domain/plugin/persistence/plugin-kv.ts": [
    'import { db, rawDb, sql } from "../../../../../db/src/drizzle.ts";',
    'import { pluginKv } from "../../../../../db/src/schema/plugin.ts";',
    "export const put = (): void => { rawDb.run(sql`INSERT INTO plugin_kv (plugin_id, owner_id, key, value) VALUES ('p', 'o', 'k', 'v')`); };",
    "export const update = (value: string): void => { db.update(pluginKv).set({ value }); };",
    "export const read = db.select().from(pluginKv).map((row) => [row.pluginId, row.ownerId, row.key, row.value, row.stray]);",
  ].join("\n"),
};

test("a column only raw SQL writes lists as deliberate, and its twin stays reported", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(RAW_SQL);
  const out = join(root, "columns.json");
  expect(await runUnwired(["columns", `--root=${root}`, `--out=${out}`])).toBe(0);
  const report = JSON.parse(readFileSync(out, "utf8")) as Report;
  expect(named(report)).toEqual(["pluginKv.stray never-written"]);
  expect(report.deliberate.map(({ member, kind }) => `${member} ${kind}`).toSorted()).toEqual([
    "key never-written",
    "ownerId never-written",
    "pluginId never-written",
  ]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const options = {
    root: await plantedTree({ ...WHOLE_SELECT, ...JUDGED_WORK }),
    worlds: [ROOT_WORLD],
    testWorlds: [],
    deliberate: [],
    log: (): undefined => undefined,
  };
  const judged = plantJudged(scanColumns(options), "cards.blurb", "notes.body");
  expect(judgedOutcome(scanColumns({ ...options, judged }), "cards.blurb", "notes.body")).toEqual(judgedExpected("cards.blurb", "notes.body"));
});
