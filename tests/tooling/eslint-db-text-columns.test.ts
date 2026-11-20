// A free-string TEXT column in the db schema is `nulFreeText`, which removes NUL on its way to the driver; the schema
// files refuse drizzle's own `text` for anything but a `mode: "json"` or an `enum` column, and refuse it under an alias.
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
const DRIZZLE = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { nulFreeText } from "../custom-types/index.ts";\n';

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

const table = (column: string): string => `${DRIZZLE}export const probe = sqliteTable("probe", { value: ${column} });`;

test.for([
  ["a plain text column", table('text("value")')],
  ["a plain text column with modifiers", table('text("value").notNull().default("")')],
  ["a text column with an option that is neither mode nor enum", table('text("value", { length: 4 })')],
  ["a text column that names the text mode", table('text("value", { mode: "text" }).notNull()')],
  ["a text column that names the text mode beside a length", table('text("value", { length: 4, mode: "text" })')],
  ["an aliased text import", 'import { text as column } from "drizzle-orm/sqlite-core";\nexport const value = column;'],
] as const)("%s in a schema file is a finding", async ([, source]) => {
  expect(await findings(source, SCHEMA_PROBE)).toHaveLength(1);
});

test.for([
  ["a nulFreeText column", table('nulFreeText("value").notNull()')],
  ["a json text column", table('text("value", { mode: "json" }).$type<readonly string[]>()')],
  ["an enum text column", table('text("value", { enum: ["a", "b"] }).notNull()')],
  ["an enum text column that names the text mode", table('text("value", { mode: "text", enum: ["a", "b"] })')],
] as const)("%s in a schema file is not a finding", async ([, source]) => {
  expect(await findings(source, SCHEMA_PROBE)).toEqual([]);
});

test("a plain text column outside the schema files is not this rule's finding", async () => {
  expect(await findings(table('text("value")'), QUERY_PROBE)).toEqual([]);
});
