// @subject tooling/src/ast/lib/columns.ts
// @subject tooling/src/ast/lib/column-reads.ts

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  beginRun,
  CORPUS_TYPED,
  collectColumnCandidates,
  collectSchemaTables,
  finishRun,
  isColumnExempt,
  parseFlags,
  scanRowReads,
  VERBS,
} from "@orb/tooling/ast";
import { schemaFromCorpus } from "@orb/tooling/floor/code-facts/schema-query";
import type { SourceCorpus } from "@orb/tooling/floor/compiler/ts-workspace";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { getTableColumns, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Project, SyntaxKind } from "ts-morph";
import { installOutputSink } from "../../../../tooling/src/floor/cli/log.ts";

const CONFIG = "packages/db/tsconfig.json";
const SCHEMA = "packages/db/src/schema/widgets.ts";
const SCHEMA_SOURCE = `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  renamed: text("real_sql_name").default("different_default"),
  createdAt: integer("created_at").default(0),
  touchedAt: integer("updated_at"),
  unused: text("unused"),
});`;

async function nativeColumns(
  fixtures: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  files: Readonly<Record<string, string>>,
): Promise<ReturnType<typeof createSemanticWorkspace>> {
  const root = await fixtures.plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    [CONFIG]: JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
      include: ["src/**/*.ts", "../../tests/**/*.ts", "../../scripts/**/*.ts"],
    }),
    ...files,
  });
  symlinkSync(join(fixtures.repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const workspace = createSemanticWorkspace({ root });
  for (const owner of workspace.programs) {
    expect(
      owner
        .project()
        .getPreEmitDiagnostics()
        .map((diagnostic) => diagnostic.getMessageText()),
    ).toEqual([]);
  }
  return workspace;
}

function auditOf(corpus: SourceCorpus): ReturnType<typeof collectColumnCandidates> {
  return collectColumnCandidates(corpus, collectSchemaTables(corpus));
}

function columnsOutput(
  corpus: SourceCorpus,
  argv: readonly string[] = ["--json", "--all", "--max", "100"],
): { readonly stdout: string; readonly stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const release = installOutputSink({ line: (line) => stdout.push(line), warn: (line) => stderr.push(line) });
  const flags = parseFlags([...argv]);
  beginRun("columns", CORPUS_TYPED, flags);
  try {
    VERBS["columns"]?.(corpus, "", flags);
    finishRun();
  } finally {
    release();
  }
  expect(stderr.join("\n")).toContain("status=complete");
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

const WIDGETS = `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const widgets = sqliteTable("widgets", {
  id: text("id"), label: text("label"),
  // @column-ok: imported provenance retained without a render surface.
  origin: text("origin"),
  tally: integer("tally"), ghost: text("ghost"), createdAt: integer("created_at").default(0), touchedAt: integer("updated_at"),
});`;
const DB_USE = `import { drizzle } from "drizzle-orm/libsql"; import { eq, sql } from "drizzle-orm";
import * as schema from "./schema/widgets.js"; import {widgets} from "./schema/widgets.js"; const db = drizzle.mock({schema});`;
const BASE_USE = `${DB_USE}
type Row = typeof widgets.$inferSelect;
export function read(row: Row) { return String(row.tally) + widgets.label; }
export function write() { db.insert(widgets).values({ id:"a",label:"b",origin:"import",tally:1,createdAt:0,touchedAt:0 }); db.update(widgets).set({tally:2}).where(eq(widgets.id,"a")); }`;

test("native column classifications retain query/row reads, writes, provenance and reasoned exemptions", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns({ plantedTree, repoRoot }, { [SCHEMA]: WIDGETS, "packages/db/src/use.ts": BASE_USE });
  const corpus = workspace.sourceCorpus();
  const candidates = auditOf(corpus).candidates;
  expect(candidates.map((candidate) => [candidate.column.jsProp, candidate.klass, candidate.writes.length, candidate.opaque])).toEqual([
    ["id", "read-write", 1, false],
    ["label", "read-write", 1, false],
    ["origin", "write-only", 1, false],
    ["tally", "read-write", 2, false],
    ["ghost", "neither", 0, false],
    ["createdAt", "provenance", 1, false],
    ["touchedAt", "write-only", 1, false],
  ]);
  expect(candidates.filter((candidate) => isColumnExempt(candidate.column.decl)).map((candidate) => candidate.column.jsProp)).toEqual(["origin"]);
  const output = columnsOutput(corpus);
  expect(output.stdout).toContain('"total": 2');
  expect(output.stdout).toContain('"kind": "column-neither"');
  expect(output.stdout).toContain("widgets.updated_at");
  expect(output.stdout).not.toContain("widgets.origin");
  expect(output.stderr).toContain("2 of 7 column(s) flagged");
});

test("native row-shape member and destructure reads retain the deliberate over-inclusive view policy", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: WIDGETS,
      "packages/db/src/use.ts": BASE_USE,
      "packages/db/src/view.ts": `interface WidgetView {id:string;label:string;origin:string;tally:number;ghost:string}
export function render(v: WidgetView) { const {ghost} = v; return v.origin + ghost; }`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const rowReads = scanRowReads(corpus, collectSchemaTables(corpus));
  const sites = (column: string): readonly string[] => [...rowReads].find(([key]) => key.endsWith(column))?.[1] ?? [];
  expect(sites("origin").length).toBeGreaterThan(0);
  expect(sites("ghost").length).toBeGreaterThan(0);
  expect(sites("label")).toEqual([]);
  expect(
    auditOf(corpus)
      .candidates.filter((candidate) => ["origin", "ghost"].includes(candidate.column.jsProp))
      .map((candidate) => candidate.klass),
  ).toEqual(["read-write", "read-only"]);
});

test("native test/tool consumers never acquit a production column or a producerless table", async ({ plantedTree, repoRoot }) => {
  const outsideUse = `import {drizzle} from "drizzle-orm/libsql"; import {widgets} from "../packages/db/src/schema/widgets.js";
const db=drizzle.mock(); db.insert(widgets).values({ghost:"fixture"}); export const read=widgets.ghost;`;
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: WIDGETS,
      "tests/widgets.test.ts": outsideUse,
      "scripts/seed.ts": outsideUse,
      "packages/db/src/use.ts": `${DB_USE} export const read=widgets.label;`,
    },
  );
  const audit = auditOf(workspace.sourceCorpus());
  expect(audit.candidates.find((candidate) => candidate.column.jsProp === "ghost")).toMatchObject({ klass: "neither", reads: [], writes: [] });
  expect(audit.producerlessTables.map((candidate) => candidate.table.varName)).toEqual(["widgets"]);
  expect(audit.tableWrites.size).toBe(0);
  expect(columnsOutput(workspace.sourceCorpus()).stdout).toContain('"kind": "column-table-producerless"');
});

test("native full-row select consumption is table reach, not invented named-column reads", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core";
export const selected=sqliteTable("selected",{value:text("value")}); export const mentioned=sqliteTable("mentioned",{value:text("value")});`,
      "packages/db/src/use.ts": `import {drizzle} from "drizzle-orm/libsql"; import {selected,mentioned} from "./schema/widgets.js";
const db=drizzle.mock(); export const tableAlias=mentioned; export const read=()=>db.select().from(selected);`,
    },
  );
  const audit = auditOf(workspace.sourceCorpus());
  expect(audit.producerlessTables.map((candidate) => candidate.table.sqlName)).toEqual(["selected"]);
  expect(audit.candidates.map((candidate) => [candidate.column.sqlTable, candidate.klass, candidate.reads])).toEqual([
    ["selected", "neither", []],
    ["mentioned", "neither", []],
  ]);
  const output = columnsOutput(workspace.sourceCorpus());
  expect(output.stdout).toContain('"total": 3');
  expect(output.stderr).toContain("selected (selected): producerless table");
  expect(output.stderr).not.toContain("mentioned (mentioned): producerless table");
});

test("native empty, named, opaque, raw and default writers retain distinct table/column evidence", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core";
export const absent=sqliteTable("absent",{seen:text("seen")});
export const empty=sqliteTable("empty",{seen:text("seen")});
export const opaque=sqliteTable("opaque",{seen:text("seen"),unseen:text("unseen")});
export const named=sqliteTable("named",{seen:text("seen")});
export const raw=sqliteTable("raw",{seen:text("seen")});
export const updated=sqliteTable("updated",{seen:text("seen")});`,
      "packages/db/src/use.ts": `import {drizzle} from "drizzle-orm/libsql"; import {sql} from "drizzle-orm"; import * as schema from "./schema/widgets.js";
const db=drizzle.mock({schema});
export const reads=[schema.absent.seen,schema.empty.seen,schema.opaque.seen,schema.named.seen,schema.raw.seen,schema.updated.seen];
db.insert(schema.empty).values({});
export function write(row:typeof schema.opaque.$inferInsert) { db.insert(schema.opaque).values(row); }
db.insert(schema.named).values({seen:"written"}); db.run(sql.raw("INSERT INTO raw DEFAULT VALUES")); db.update(schema.updated).set({});`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const tables = collectSchemaTables(corpus);
  const audit = auditOf(corpus);
  expect(audit.producerlessTables.map((candidate) => candidate.table.varName)).toEqual(["absent"]);
  expect(tables.filter((table) => audit.tableWrites.has(table.key)).map((table) => table.varName)).toEqual(["empty", "opaque", "named", "raw", "updated"]);
  expect(tables.filter((table) => audit.opaqueTables.has(table.key)).map((table) => table.varName)).toEqual(["opaque"]);
  expect(audit.candidates.find((candidate) => candidate.column.sqlTable === "opaque" && candidate.column.jsProp === "unseen")).toMatchObject({
    klass: "write-only",
    opaque: true,
    writes: [],
    reads: [],
  });
});

test("native hoisted/upsert and named insert-select writes exclude foreign fluent methods", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: WIDGETS,
      "packages/db/src/use.ts": `${BASE_USE}
export function copy(){ db.insert(widgets).select(db.select({id:sql<string>\`'copy'\`.as("id"),label:widgets.label}).from(widgets)); }
const query=db.update(widgets); query.set({ghost:"x"});
db.insert(widgets).values({id:"upsert"}).onConflictDoUpdate({target:widgets.id,set:{origin:"upsert"}});
const store={update:(_table:typeof widgets)=>({set:(_value:object)=>{}})}; store.update(widgets).set({touchedAt:0});`,
    },
  );
  const audit = auditOf(workspace.sourceCorpus());
  const byName = new Map(audit.candidates.map((candidate) => [candidate.column.jsProp, candidate]));
  expect(byName.get("id")?.writes).toHaveLength(3);
  expect(byName.get("label")?.writes).toHaveLength(2);
  expect(byName.get("origin")?.writes).toHaveLength(2);
  expect(byName.get("ghost")?.writes).toHaveLength(1);
  expect(byName.get("touchedAt")?.writes).toHaveLength(1);
  expect(audit.opaqueTables.size).toBe(0);
});

test("native positional insert-select remains opaque instead of inventing destination fields", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: WIDGETS,
      "packages/db/src/use.ts": `${BASE_USE} db.insert(widgets).select(db.select().from(widgets));`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const audit = auditOf(corpus);
  expect([...audit.opaqueTables.keys()]).toEqual([collectSchemaTables(corpus)[0]?.key]);
  expect(audit.candidates.find((candidate) => candidate.column.jsProp === "ghost")).toMatchObject({ opaque: true, klass: "write-only" });
});

test("native raw SQL writes require execution and immutable static headers, not inert or dynamic text", async ({ plantedTree, repoRoot }) => {
  const names = ["inert_tagged", "inert_raw", "dynamic_raw", "reassigned_statement", "executed_raw", "batched_raw"];
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core"; ${names.map((name) => `export const ${name}=sqliteTable("${name}",{seen:text("seen")});`).join("\n")}`,
      "packages/db/src/use.ts": `import {drizzle} from "drizzle-orm/libsql"; import {sql} from "drizzle-orm"; import * as schema from "./schema/widgets.js";
const db=drizzle.mock({schema}); export const reads=[${names.map((name) => `schema.${name}.seen`).join(",")}];
export const inertTagged=sql\`INSERT INTO inert_tagged DEFAULT VALUES\`; export const inertRaw=sql.raw("INSERT INTO inert_raw DEFAULT VALUES");
export function dynamic(text:string){ db.run(sql.raw(text)); let statement=sql\`INSERT INTO reassigned_statement DEFAULT VALUES\`; statement=sql.raw(text); db.run(statement); }
db.run(sql\`INSERT INTO executed_raw DEFAULT VALUES\`); const batchStatement=sql\`INSERT INTO batched_raw DEFAULT VALUES\`; db.batch([db.run(batchStatement)]);`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const audit = auditOf(corpus);
  expect(audit.producerlessTables.map((candidate) => candidate.table.sqlName)).toEqual(names.slice(0, 4));
  expect(
    collectSchemaTables(corpus)
      .filter((table) => audit.tableWrites.has(table.key))
      .map((table) => table.sqlName),
  ).toEqual(names.slice(4));
});

test("native raw INSERT headers attribute only their target columns; raw reads and decoy constructors do not write", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: WIDGETS,
      "packages/db/src/use.ts": `${BASE_USE}
db.run(sql\`INSERT INTO widgets (id, origin) SELECT 'id', 'import'\`);
db.run(sql\`INSERT INTO "widgets" ("label") VALUES ('quoted')\`);
db.run(sql\`SELECT ghost FROM widgets\`); db.run(sql\`INSERT INTO other_table (tally) VALUES (1)\`);
db.run(sql\`SELECT 'INSERT INTO widgets (ghost)' /* INSERT INTO widgets (tally) */\`);
const sqlFake=(parts:TemplateStringsArray)=>sql.raw(parts.join("")); db.run(sqlFake\`INSERT INTO widgets (ghost) VALUES ('decoy')\`);`,
    },
  );
  const audit = auditOf(workspace.sourceCorpus());
  const byName = new Map(audit.candidates.map((candidate) => [candidate.column.jsProp, candidate]));
  expect(byName.get("id")?.writes).toHaveLength(2);
  expect(byName.get("origin")?.writes).toHaveLength(2);
  expect(byName.get("label")?.writes).toHaveLength(2);
  expect(byName.get("ghost")).toMatchObject({ writes: [], rawSql: true });
  expect(byName.get("tally")?.writes).toHaveLength(2);
});

test("native same-named table exports keep canonical declaration keys and healthy output separate", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      "packages/db/src/schema/a.ts":
        'import {sqliteTable,text} from "drizzle-orm/sqlite-core"; export const events=sqliteTable("a_events",{value:text("value")});',
      "packages/db/src/schema/b.ts":
        'import {sqliteTable,text} from "drizzle-orm/sqlite-core"; export const events=sqliteTable("b_events",{value:text("value")});',
      "packages/db/src/use.ts": `import {drizzle} from "drizzle-orm/libsql"; import {events as aEvents} from "./schema/a.js"; const db=drizzle.mock(); db.insert(aEvents).values({value:"written"}); export const read=aEvents.value;`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const tables = collectSchemaTables(corpus);
  const audit = auditOf(corpus);
  expect(new Set(tables.map((table) => table.key)).size).toBe(2);
  expect(tables.map((table) => table.varName)).toEqual(["events", "events"]);
  expect(audit.candidates.map((candidate) => [candidate.column.sqlTable, candidate.klass])).toEqual([
    ["a_events", "read-write"],
    ["b_events", "neither"],
  ]);
  expect(audit.producerlessTables).toEqual([]);
  const output = columnsOutput(corpus, ["--all", "--max", "100"]);
  expect(output.stdout).toContain("a_events (events): healthy — 0 of 1 column(s) flagged");
  expect(output.stdout).toContain("b_events (events): 1 of 1 column(s) flagged");
  expect(output.stdout).toContain("columns --all: swept 2 table(s), 1 carrying a finding.");
});

test("native literal, SQL-expression and runtime defaults preserve timestamp provenance without name-only exemption", async ({ plantedTree, repoRoot }) => {
  const definitions = [
    ["literal", 'integer("created_at").default(0)'],
    ["expression", 'integer("created_at").default(sql`0`)'],
    ["runtime", 'integer("created_at").$defaultFn(()=>0)'],
    ["runtimeAlias", 'integer("created_at").$default(()=>0)'],
    ["update", 'integer("updated_at").$onUpdateFn(()=>0)'],
    ["updateAlias", 'integer("updated_at").$onUpdate(()=>0)'],
    ["combined", 'integer("created_at").default(0).$defaultFn(()=>1).$onUpdateFn(()=>2)'],
    ["bare", 'integer("created_at")'],
    ["other", 'integer("ordinary").default(0)'],
    ["implicit", 'integer("created_at").primaryKey()'],
  ] as const;
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,integer} from "drizzle-orm/sqlite-core"; import {sql} from "drizzle-orm"; ${definitions.map(([name, builder]) => `export const ${name}=sqliteTable("${name}",{stamp:${builder}});`).join("\n")}`,
      "packages/db/src/use.ts": `import {drizzle} from "drizzle-orm/libsql"; import * as schema from "./schema/widgets.js"; const db=drizzle.mock({schema}); ${definitions.map(([name]) => `db.insert(schema.${name}).values({stamp:0});`).join("\n")}`,
    },
  );
  expect(auditOf(workspace.sourceCorpus()).candidates.map((candidate) => [candidate.column.sqlTable, candidate.column.hasDefault, candidate.klass])).toEqual(
    definitions.map(([name], index) => [name, index < 7 || name === "other", index < 7 ? "provenance" : "write-only"]),
  );
  const corpus = workspace.sourceCorpus();
  const schema = schemaFromCorpus(
    corpus,
    corpus.getSourceFiles().filter((source) => source.getFilePath().endsWith(SCHEMA)),
  );
  if (schema.status !== "ready") {
    throw new Error(schema.reason);
  }
  const operations = new Map(schema.value.tables.map((table) => [table.identity.declarationName, table.columns[0]?.defaultOperations]));
  expect(definitions.map(([name]) => [name, operations.get(name)])).toEqual([
    ["literal", ["default"]],
    ["expression", ["default"]],
    ["runtime", ["$defaultFn"]],
    ["runtimeAlias", ["$default"]],
    ["update", ["$onUpdateFn"]],
    ["updateAlias", ["$onUpdate"]],
    ["combined", ["default", "$defaultFn", "$onUpdateFn"]],
    ["bare", []],
    ["other", ["default"]],
    ["implicit", []],
  ]);
});

test("schema corpus bridge refuses unregistered carriers, wrong-world sources and ambiguous native owners", async ({ plantedTree, repoRoot }) => {
  const unregistered = new Project({ useInMemoryFileSystem: true });
  const file = unregistered.createSourceFile(`/repo/${SCHEMA}`, SCHEMA_SOURCE);
  expect(schemaFromCorpus(unregistered, [file])).toMatchObject({ status: "unresolved", reason: expect.stringContaining("no admitted native") });
  const workspace = await nativeColumns({ plantedTree, repoRoot }, { [SCHEMA]: SCHEMA_SOURCE });
  const corpus = workspace.sourceCorpus();
  const sources = corpus.getSourceFiles();
  expect(schemaFromCorpus(corpus, sources)).toMatchObject({ status: "ready", receipt: { tables: 1, columns: 5 } });
  expect(schemaFromCorpus(corpus, [])).toMatchObject({ status: "missing", receipt: { tables: 0, columns: 0 } });
  const otherWorld = new Project();
  const otherFile = otherWorld.addSourceFileAtPath(join(workspace.root, SCHEMA));
  expect(schemaFromCorpus(corpus, [otherFile])).toMatchObject({ status: "unresolved", reason: expect.stringContaining("does not belong") });
  expect(schemaFromCorpus(corpus, [file])).toMatchObject({ status: "unresolved", reason: expect.stringContaining("outside") });
  const ambiguous = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: SCHEMA_SOURCE,
      "tsconfig.json": JSON.stringify({ compilerOptions: { skipLibCheck: true, module: "NodeNext", moduleResolution: "NodeNext" }, include: [SCHEMA] }),
    },
  );
  expect(schemaFromCorpus(ambiguous.sourceCorpus(), ambiguous.sourceCorpus().getSourceFiles())).toMatchObject({
    status: "unresolved",
    reason: expect.stringContaining("2 admitted root owners"),
  });
});

test("native schema reader excludes foreign same-spelled builders and refuses dynamic SQL names", async ({ plantedTree, repoRoot }) => {
  const foreign = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `const sqliteTable=<T>(name:string,columns:T)=>({name,columns}); const text=(name:string)=>name; export const foreign=sqliteTable("fake",{id:text("id")});`,
    },
  );
  expect(collectSchemaTables(foreign.sourceCorpus())).toEqual([]);
  const dynamic = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core"; const sqlName=process.env["SQL_NAME"]??"fallback"; export const widgets=sqliteTable("widgets",{id:text(sqlName)});`,
    },
  );
  expect(() => collectSchemaTables(dynamic.sourceCorpus())).toThrow("unresolved schema");
});

test("schema corpus bridge groups each admitted owner without dropping an empty schema group", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [CONFIG]: JSON.stringify({
        compilerOptions: { skipLibCheck: true, module: "NodeNext", moduleResolution: "NodeNext" },
        include: ["src/schema/widgets.ts"],
      }),
      "packages/other/tsconfig.json": JSON.stringify({
        compilerOptions: { skipLibCheck: true, module: "NodeNext", moduleResolution: "NodeNext" },
        include: ["../db/src/schema/a-empty.ts"],
      }),
      "packages/db/src/schema/a-empty.ts": "export const notATable=true;",
      [SCHEMA]: SCHEMA_SOURCE,
    },
  );
  const corpus = workspace.sourceCorpus();
  expect(schemaFromCorpus(corpus, corpus.getSourceFiles())).toMatchObject({ status: "ready", receipt: { tables: 1, columns: 5 } });
  expect(collectSchemaTables(corpus).map((table) => table.sqlName)).toEqual(["widgets"]);
});

test("native schema aliases, namespaces, composed and unnamed columns retain canonical declaration identities", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import { sqliteTable as table, text as stringColumn } from "drizzle-orm/sqlite-core";
import * as sqlite from "drizzle-orm/sqlite-core";
import { shared as importedColumns } from "../columns.js";
const shared = importedColumns;
const shorthand = sqlite.text("physical_shorthand");
const makeTable = table;
const stringBuilder = stringColumn;
export const widgets = makeTable("widgets", { ...shared, shorthand, unnamed: stringBuilder().default("unnamed_default"), empty: sqlite.text(""), json: sqlite.text({ mode: "json" }).$type<{value:string}>() });
export const namespaceTable = sqlite.sqliteTable("namespaced", { value:sqlite.text("value") });`,
      "packages/db/src/columns.ts": `import {text} from "drizzle-orm/sqlite-core"; export const shared={composed:text("physical_composed").default("not_a_name")};`,
      "packages/db/src/consumers.ts": `import { widgets, namespaceTable } from "./schema/widgets.js";
export const reads = [widgets.composed, widgets.shorthand, widgets.unnamed, widgets.empty, widgets.json, namespaceTable.value];`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const tables = collectSchemaTables(corpus);
  expect(tables.map((table) => [table.varName, table.sqlName])).toEqual([
    ["widgets", "widgets"],
    ["namespaceTable", "namespaced"],
  ]);
  expect(tables[0]?.columns[0]?.decl.getSourceFile().getFilePath()).toBe(join(workspace.root, "packages/db/src/columns.ts"));
  expect(tables[0]?.columns[1]?.decl.getKindName()).toBe("ShorthandPropertyAssignment");
  const schema = schemaFromCorpus(
    corpus,
    corpus.getSourceFiles().filter((source) => source.getFilePath().endsWith(SCHEMA)),
  );
  if (schema.status !== "ready") {
    throw new Error(schema.reason);
  }
  expect(
    schema.value.tables.find((table) => table.identity.declarationName === "widgets")?.columns.find((column) => column.identity.propertyName === "json")?.json,
  ).toMatchObject({
    mode: "json",
    shape: { kind: "closed", keys: ["value"] },
  });
  expect(tables[0]?.columns.map((column) => [column.jsProp, column.sqlColumn])).toEqual([
    ["composed", "physical_composed"],
    ["shorthand", "physical_shorthand"],
    ["unnamed", "unnamed"],
    ["empty", "empty"],
    ["json", "json"],
  ]);
  expect(collectColumnCandidates(corpus, tables).candidates.map((candidate) => [candidate.column.jsProp, candidate.klass])).toEqual([
    ["composed", "read-only"],
    ["shorthand", "read-only"],
    ["unnamed", "read-only"],
    ["empty", "read-only"],
    ["json", "read-only"],
    ["value", "read-only"],
  ]);
});

test("native unreadable and mutated columns populations refuse instead of silently shrinking", async ({ plantedTree, repoRoot }) => {
  const unreadable = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core";
function columns(){ return {id:text("id")}; } export const widgets=sqliteTable("widgets",columns());`,
    },
  );
  expect(() => collectSchemaTables(unreadable.sourceCorpus())).toThrow("unresolved schema");
  const mutated = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core";
const columns={id:text("id")}; columns.id=text("id").default("replacement"); export const widgets=sqliteTable("widgets",columns);`,
    },
  );
  expect(() => collectSchemaTables(mutated.sourceCorpus())).toThrow(/unresolved schema:.*(?:mutated|assigned|write)/u);
});

test("native explicit undefined names use property fallback without confusing config positions or shadowed bindings", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
import { missingName } from "../names.js";
export const widgets=sqliteTable("widgets",{
  explicit:text(undefined), global:text(globalThis.undefined), alias:text(missingName), voided:text(void 0), numeric:integer(undefined),
  emptyJson:text("",{mode:"json"}).$type<{value:string}>(), configJson:text({mode:"json"}).$type<{value:string}>(),
});`,
      "packages/db/src/names.ts": "export const missingName=undefined;",
      "packages/db/src/schema/shadow.ts": `import {sqliteTable,text} from "drizzle-orm/sqlite-core"; const undefined="physical_shadow"; export const shadow=sqliteTable("shadow",{value:text(undefined)});`,
    },
  );
  const corpus = workspace.sourceCorpus();
  const tables = collectSchemaTables(corpus);
  expect(tables.find((table) => table.varName === "widgets")?.columns.map((column) => [column.jsProp, column.sqlColumn])).toEqual([
    ["explicit", "explicit"],
    ["global", "global"],
    ["alias", "alias"],
    ["voided", "voided"],
    ["numeric", "numeric"],
    ["emptyJson", "emptyJson"],
    ["configJson", "configJson"],
  ]);
  expect(tables.find((table) => table.varName === "shadow")?.columns.map((column) => column.sqlColumn)).toEqual(["physical_shadow"]);
  const schema = schemaFromCorpus(
    corpus,
    corpus.getSourceFiles().filter((source) => source.getFilePath().endsWith(SCHEMA)),
  );
  if (schema.status !== "ready") {
    throw new Error(schema.reason);
  }
  expect(
    schema.value.tables[0]?.columns.filter((column) => column.json !== null).map((column) => [column.identity.propertyName, column.json?.shape]),
  ).toMatchObject([
    ["emptyJson", { kind: "closed", keys: ["value"] }],
    ["configJson", { kind: "closed", keys: ["value"] }],
  ]);
});

test("native shadowed undefined with a dynamic string stays unresolved rather than becoming an unnamed column", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: `import {sqliteTable,text} from "drizzle-orm/sqlite-core"; import {name as undefined} from "../names.js"; export const widgets=sqliteTable("widgets",{value:text(undefined)});`,
      "packages/db/src/names.ts": 'export const name=process.env["SQL_NAME"]??"fallback";',
    },
  );
  expect(() => collectSchemaTables(workspace.sourceCorpus())).toThrow("unresolved schema");
});

test("native AST columns takes SQL names from the builder root, not its default", async ({ plantedTree, repoRoot }) => {
  const workspace = await nativeColumns(
    { plantedTree, repoRoot },
    {
      [SCHEMA]: SCHEMA_SOURCE,
      "packages/db/src/consumers.ts": `import { sql } from "drizzle-orm"; import type { LibSQLDatabase } from "drizzle-orm/libsql"; import * as schema from "./schema/widgets.js";
export function consume(db: LibSQLDatabase<typeof schema>) {
  db.run(sql\`INSERT INTO widgets (id, real_sql_name, created_at, updated_at) VALUES ('id', 'written', 0, 0)\`);
  return schema.widgets.renamed;
}`,
    },
  );
  const owner = workspace.program(CONFIG);
  if (owner === undefined) {
    throw new Error("the native DB world was not admitted");
  }
  const call = owner
    .sourceFile(SCHEMA)
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((node) => node.getExpression().getText() === "sqliteTable");
  if (call === undefined) {
    throw new Error("the actual native sqliteTable call is missing");
  }
  const declarations = call.getExpression().getSymbol()?.getAliasedSymbol()?.getDeclarations() ?? [];
  expect(declarations).not.toHaveLength(0);
  expect(declarations.every((node) => node.getSourceFile().getFilePath().includes("/drizzle-orm/"))).toBe(true);
  const corpus = workspace.sourceCorpus();
  const tables = collectSchemaTables(corpus);
  const output = columnsOutput(corpus);
  expect(output.stdout).toContain('"total": 3');
  expect(output.stdout).not.toContain("different_default");
  expect(output.stdout).not.toContain("real_sql_name");
  expect(output.stderr).toContain("3 of 5 column(s) flagged");
  const byName = new Map(collectColumnCandidates(corpus, tables).candidates.map((candidate) => [candidate.column.jsProp, candidate]));
  expect(tables.map(({ sqlName }) => sqlName)).toEqual(["widgets"]);
  expect(byName.get("renamed")?.column.sqlColumn).toBe("real_sql_name");
  expect(byName.get("renamed")?.klass).toBe("read-write");
  expect(byName.get("createdAt")?.klass).toBe("provenance");
  expect(byName.get("touchedAt")?.klass).toBe("write-only");
  expect(byName.get("unused")?.klass).toBe("neither");
});

test("installed Drizzle keeps physical names separate from schema default values", () => {
  const table = sqliteTable("widgets", {
    renamed: text("real_sql_name").default("different_default"),
    unnamed: text(),
    empty: text(""),
    createdAt: integer("created_at").default(0),
    sqlDefault: integer("sql_default").default(sql`0`),
    runtimeDefault: integer("runtime_default").$defaultFn(() => 0),
    runtimeUpdate: integer("runtime_update").$onUpdateFn(() => 0),
    implicit: integer("implicit").primaryKey(),
    explicit: text(globalThis.undefined),
    emptyJson: text("", { mode: "json" }),
    configJson: text({ mode: "json" }),
  });
  const columns = getTableColumns(table);
  expect([columns.renamed.name, columns.renamed.default]).toEqual(["real_sql_name", "different_default"]);
  expect([columns.unnamed.name, columns.empty.name]).toEqual(["unnamed", "empty"]);
  expect([columns.createdAt.hasDefault, columns.createdAt.default]).toEqual([true, 0]);
  expect([columns.sqlDefault.hasDefault, columns.sqlDefault.default]).toEqual([true, expect.anything()]);
  expect([columns.runtimeDefault.hasDefault, columns.runtimeDefault.default, columns.runtimeDefault.defaultFn?.()]).toEqual([true, undefined, 0]);
  expect([columns.runtimeUpdate.hasDefault, columns.runtimeUpdate.default, columns.runtimeUpdate.onUpdateFn?.()]).toEqual([true, undefined, 0]);
  expect(columns.implicit.hasDefault).toBe(true);
  expect([columns.explicit.name, columns.emptyJson.name, columns.configJson.name]).toEqual(["explicit", "emptyJson", "configJson"]);
  expect([columns.emptyJson.dataType, columns.configJson.dataType]).toEqual(["json", "json"]);
});
