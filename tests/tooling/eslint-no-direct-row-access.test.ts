// orb/no-direct-row-writes and orb/no-direct-row-reads resolve the touched member to drizzle's database or
// transaction, and only the persistence tier may write or read rows directly.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const WRITES = "orb/no-direct-row-writes";
const READS = "orb/no-direct-row-reads";
const COMPOSED = "tests/server/domain/probe/row-access-probe.int.test.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, COMPOSED));
}, 120_000);

const PRELUDE = `
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
const rows = sqliteTable("rows", { id: text("id").primaryKey() });
declare const db: LibSQLDatabase;
declare const root: { readonly db: LibSQLDatabase };
declare const store: {
  insert(value: string): void; update(value: string): void; delete(value: string): void; run(value: string): void;
  select(): void; get(key: string): void; all(): void; values(): void; query: string;
};
declare const cache: Map<string, string>;
void sql;
`;

// A one-file program over the real drizzle declarations: the rules need type information, not the repo graph.
function programFor(fileName: string, source: string): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2024,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    types: [],
    noEmit: true,
  };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
    name === fileName ? ts.createSourceFile(name, source, version, true) : read(name, version, onError, create);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name): string | undefined => (name === fileName ? source : readFile(name));
  return ts.createProgram([fileName], options, host);
}

async function findings(rule: typeof WRITES | typeof READS, body: string, path: string = COMPOSED): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, path);
  const source = `${PRELUDE}\nexport async function probe(): Promise<void> {\n${body}\n}\n`;
  const config = await eslint.calculateConfigForFile(fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)] } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

test.for([
  ["an insert on the database", `await db.insert(rows).values({ id: "a" });`],
  ["an update inside a transaction", `await db.transaction(async (tx) => { await tx.update(rows).set({ id: "b" }); });`],
  ["a raw statement run", "await db.run(sql`UPDATE rows SET id = 'c'`);"],
  ["a delete through a root's database", "await root.db.delete(rows);"],
  ["a batch of builders", "await db.batch([db.select().from(rows)]);"],
] as const)("%s outside the persistence tier is one write finding", async ([, body]) => {
  expect(await findings(WRITES, body)).toHaveLength(1);
});

test.for([
  ["a select", "await db.select().from(rows);"],
  ["a distinct select", "await db.selectDistinct().from(rows);"],
  ["a row count", "await db.$count(rows);"],
  ["a common-table-expression builder", "db.with();"],
  ["a CTE definition", `db.$with("cte");`],
  ["a raw multi-row read", "await db.all(sql`SELECT 1`);"],
  ["a raw single-row read", "await db.get(sql`SELECT 1`);"],
  ["a raw values read", "await db.values(sql`SELECT 1`);"],
  ["the relational query door", "void db.query;"],
  ["the relational query door by optional chain", "void db?.query;"],
  ["the relational query door by element access", `void db["query"];`],
  ["a select inside a transaction", "await db.transaction(async (tx) => { await tx.select().from(rows); });"],
  ["a single-row read through a root's database", "await root.db.get(sql`SELECT 1`);"],
] as const)("%s outside the persistence tier is one read finding", async ([, body]) => {
  expect(await findings(READS, body)).toHaveLength(1);
});

test("writes are not reads, reads are not writes, and same-named members on other types are neither", async () => {
  expect(await findings(WRITES, "await db.select().from(rows);\nvoid db.query;")).toEqual([]);
  expect(await findings(READS, `await db.insert(rows).values({ id: "a" });\nawait db.transaction(async () => undefined);`)).toEqual([]);
  expect(await findings(WRITES, `store.insert("a");\nstore.update("b");\nstore.delete("c");\nstore.run("d");`)).toEqual([]);
  expect(
    await findings(READS, `store.select();\nstore.get("a");\nstore.all();\nstore.values();\nvoid store.query;\ncache.get("a");\nvoid [...cache.values()];`),
  ).toEqual([]);
});

test.for([
  "tests/db/schema/row-access-probe.int.test.ts",
  "tests/server/domain/probe/persistence/row-access-probe.int.test.ts",
  "tests/support/node/row-access-probe.ts",
  "tests/tooling/seed/ops/row-access-probe.int.test.ts",
])("the persistence tier or tooling test %s may write and read rows directly", async (path) => {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config?.rules?.[WRITES]).toBeUndefined();
  expect(config?.rules?.[READS]).toBeUndefined();
  expect(await findings(WRITES, `await db.insert(rows).values({ id: "a" });`, path)).toEqual([]);
  expect(await findings(READS, "await db.select().from(rows);\nvoid db.query;", path)).toEqual([]);
});

test.for(["scripts/row-access-probe.ts", "playwright/row-access-probe.ts", "tests/e2e/row-access-probe.spec.ts"])(
  "%s is in scope of both rules",
  async (path) => {
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config?.rules?.[WRITES]).toEqual([2]);
    expect(config?.rules?.[READS]).toEqual([2]);
  },
);
