// orb/no-direct-row-writes resolves the called method to drizzle's database or transaction, and only the
// persistence tier may write rows directly.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-direct-row-writes";
const COMPOSED = "tests/server/domain/probe/row-write-probe.int.test.ts";
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
declare const store: { insert(value: string): void; update(value: string): void; delete(value: string): void; run(value: string): void };
void sql;
`;

// A one-file program over the real drizzle declarations: the rule needs type information, not the repo graph.
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

async function findings(body: string, path: string = COMPOSED): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, path);
  const source = `${PRELUDE}\nexport async function probe(): Promise<void> {\n${body}\n}\n`;
  const config = await eslint.calculateConfigForFile(fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)] } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["an insert on the database", `await db.insert(rows).values({ id: "a" });`],
  ["an update inside a transaction", `await db.transaction(async (tx) => { await tx.update(rows).set({ id: "b" }); });`],
  ["a raw statement run", "await db.run(sql`UPDATE rows SET id = 'c'`);"],
  ["a delete through a root's database", "await root.db.delete(rows);"],
  ["a batch of builders", "await db.batch([db.select().from(rows)]);"],
] as const)("%s outside the persistence tier is one finding", async ([, body]) => {
  expect(await findings(body)).toHaveLength(1);
});

test("reads and same-named methods on other types are not writes", async () => {
  expect(await findings("await db.select().from(rows);\nawait db.query.rows?.findMany();")).toEqual([]);
  expect(await findings(`store.insert("a");\nstore.update("b");\nstore.delete("c");\nstore.run("d");`)).toEqual([]);
});

test.for([
  "tests/db/schema/row-write-probe.int.test.ts",
  "tests/server/domain/probe/persistence/row-write-probe.int.test.ts",
  "tests/support/node/row-write-probe.ts",
])("the persistence tier %s may write rows directly", async (path) => {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config?.rules?.[RULE]).toBeUndefined();
  expect(await findings(`await db.insert(rows).values({ id: "a" });`, path)).toEqual([]);
});

test.for(["scripts/row-write-probe.ts", "playwright/row-write-probe.ts", "tests/e2e/row-write-probe.spec.ts"])("%s is in scope", async (path) => {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config?.rules?.[RULE]).toEqual([2]);
});
