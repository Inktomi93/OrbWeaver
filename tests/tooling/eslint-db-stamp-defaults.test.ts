// A row stamp in the db schema is `stampColumn`, which each insert states from the injected clock; the schema files
// refuse a wall-clock SQL expression, inline in a column default or hoisted into a const.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const SCHEMA_PROBE = "packages/db/src/schema/probe.ts";
const QUERY_PROBE = "packages/db/src/query/probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
const HEAD =
  'import { sql } from "drizzle-orm";\nimport { integer, sqliteTable } from "drizzle-orm/sqlite-core";\nimport { stampColumn } from "../custom-types/index.ts";\n';

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SCHEMA_PROBE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const table = (column: string): string => `${HEAD}export const probe = sqliteTable("probe", { at: ${column} });`;

test.for([
  ["an inline unixepoch default", table('integer("at").notNull().default(sql`(unixepoch() * 1000)`)')],
  [
    "a hoisted unixepoch const",
    `${HEAD}const NOW_MS = sql\`(unixepoch() * 1000)\`;\nexport const probe = sqliteTable("probe", { at: integer("at").notNull().default(NOW_MS) });`,
  ],
  ["a CURRENT_TIMESTAMP default", table('integer("at").notNull().default(sql`CURRENT_TIMESTAMP`)')],
  ["a datetime('now') default", table("integer(\"at\").notNull().default(sql`(datetime( 'now'))`)")],
  ["a raw string wall-clock default", table('integer("at").notNull().default(sql.raw("(unixepoch() * 1000)"))')],
] as const)("%s in a schema file is a finding", async ([, source]) => {
  expect(await findings(source, SCHEMA_PROBE)).toHaveLength(1);
});

test.for([
  ["a stampColumn", table('stampColumn("at")')],
  ["a constant default", table('integer("at").notNull().default(0)')],
  ["a non-clock SQL check", table('integer("at").notNull().default(sql`(1)`)')],
] as const)("%s in a schema file is not a finding", async ([, source]) => {
  expect(await findings(source, SCHEMA_PROBE)).toEqual([]);
});

test("a wall-clock default outside the schema files is not this rule's finding", async () => {
  expect(await findings(table('integer("at").notNull().default(sql`(unixepoch() * 1000)`)'), QUERY_PROBE)).toEqual([]);
});
