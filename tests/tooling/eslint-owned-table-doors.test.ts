// The owned-table rows refuse the doors that need no import of the table: drizzle's relational door
// (`db.query.<table>`) in every access spelling, the table object off the db handle, and raw SQL text that names the table. The probes compile in one
// server program, so the checker types each member as the real drizzle builder.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { sqlTableName } from "../../tooling/src/eslint/owned-table.ts";
import { OWNED_TABLE_RESTRICTIONS } from "../../tooling/src/eslint/security-policy.ts";
import { resolvedConfig } from "./_eslint-config.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
const RULES = OWNED_TABLE_RESTRICTIONS.map(({ id }) => `orb/${id}`);
// Every owned row holds this directory.
const PROBE_DIR = "packages/server/src/domain/discovery/verbs";
const SETTINGS_HOME = "packages/server/src/domain/settings/persistence/zz-owned-probe.ts";
const NAMES_PROBE = `${PROBE_DIR}/zz-owned-names.ts`;
const DB_TYPES = ["Db", "ReadOnlyDb"] as const;

// The imports a probe body uses, so the probe compiles under the server's unused-import checks.
function header(body: string): string {
  const types = DB_TYPES.filter((name) => new RegExp(String.raw`\b${name}\b`, "u").test(body));
  const typeImport = types.length === 0 ? "" : `import type { ${types.join(", ")} } from "@orb/db";\n`;
  const sqlImport = /\bsql\b/u.test(body) && !body.includes('from "drizzle-orm"') ? 'import { sql } from "drizzle-orm";\n' : "";
  return `${typeImport}${sqlImport}`;
}
const TIMEOUT = scaledBudget(120_000);
const CASE_TIMEOUT = { timeout: TIMEOUT };

// Each relational, table-object and raw SQL spelling of a read of `table`; every one is refused.
const refused = (table: string): Readonly<Record<string, string>> => {
  const name = sqlTableName(table);
  return {
    dot: `export const f = async (db: Db) => await db.query.${table}.findMany();`,
    computed: `export const f = async (db: Db) => await db.query["${table}"].findFirst();`,
    optional: `export const f = async (db?: Db) => await db?.query.${table}.findMany();`,
    "read-only handle": `export const f = async (db: ReadOnlyDb) => await db.query.${table}.findMany();`,
    alias: `export const f = async (db: Db) => {\n  const q = db.query;\n  return await q.${table}.findMany();\n};`,
    destructure: `export const f = async (db: Db) => {\n  const { ${table}: rows } = db.query;\n  return await rows.findMany();\n};`,
    "parameter destructure": `export const f = async ({ ${table}: rows }: Db["query"]) => await rows.findMany();`,
    "sql template": `export const f = (id: string) => sql\`select * from "${name}" where id = \${id}\`;`,
    "sql raw": `export const f = () => sql.raw("DELETE FROM ${name}");`,
    "const name": `const NAME = "${table}";\nexport const f = async (db: Db) => await db.query[NAME].findMany();`,
    helper: `const queryOf = (db: Db) => db.query;\nexport const f = async (db: Db) => await queryOf(db).${table}.findMany();`,
    "helper alias": `const queryOf = (db: Db) => db.query;\nexport const f = async (db: Db) => {\n  const r = queryOf(db);\n  return await r.${table}.findMany();\n};`,
    spread: `export const f = async (db: Db) => await { ...db.query }.${table}.findMany();`,
    "nested destructure": `export const f = async (db: Db) => {\n  const { query: { ${table}: rows } } = db;\n  return await rows.findMany();\n};`,
    "full schema": `export const f = async (db: Db) => await db.select().from(db._.fullSchema.${table});`,
    "comma join": `export const f = () => sql\`select * from chats c, ${name} n\`;`,
    "sql raw const": `const STATEMENT = "DELETE FROM ${name}";\nexport const f = () => sql.raw(STATEMENT);`,
    "sql identifier": `export const f = () => sql\`select * from \${sql.identifier("${name}")}\`;`,
    "aliased sql": `import { sql as q } from "drizzle-orm";\nexport const f = () => q\`select * from ${name}\`;`,
  };
};

// Spellings that name no owned table: a local binding of the name, a table no row owns, a longer SQL identifier, and a
// member typed as something other than a drizzle door.
const passed = (table: string): Readonly<Record<string, string>> => ({
  "local binding": `const ${table} = { findMany: () => 1 };\nexport const f = () => ${table}.findMany();`,
  "unowned table": "export const f = async (db: Db) => await db.query.assets.findMany();",
  "longer identifier": `export const f = () => sql\`select * from ${sqlTableName(table)}_archive\`;`,
  "longer sql identifier": `export const f = () => sql.identifier("${sqlTableName(table)}_archive");`,
  "typed non-drizzle member": `const rows = { ${table}: [1] };\nexport const f = () => rows.${table}.length;`,
});

interface Probe {
  readonly path: string;
  readonly source: string;
}

const probes: Probe[] = [];
const probe = (path: string, body: string): Probe => {
  const made = { path, source: `${header(body)}${body}\n` };
  probes.push(made);
  return made;
};

const cases = OWNED_TABLE_RESTRICTIONS.flatMap(({ id, tables }) =>
  tables.flatMap((table) => [
    ...Object.entries(refused(table)).map(([form, body]) => ({
      rule: `orb/${id}`,
      table,
      form,
      count: 1,
      probe: probe(`${PROBE_DIR}/zz-${table}-${form.replaceAll(" ", "-")}.ts`, body),
    })),
    ...Object.entries(passed(table)).map(([form, body]) => ({
      rule: `orb/${id}`,
      table,
      form,
      count: 0,
      probe: probe(`${PROBE_DIR}/zz-${table}-pass-${form.replaceAll(" ", "-")}.ts`, body),
    })),
  ]),
);
const home = probe(SETTINGS_HOME, "export const f = async (db: Db) => await db.query.settings.findMany();");
// Each owned table's SQL name, spelled as `sqlTableName` derives it and typed against drizzle's own table name.
const names = probe(
  NAMES_PROBE,
  `import { ${OWNED_TABLE_RESTRICTIONS.flatMap(({ tables }) => tables).join(", ")} } from "@orb/db";\n${OWNED_TABLE_RESTRICTIONS.flatMap(({ tables }) => tables)
    .map((table) => `export const ${table}Name: "${sqlTableName(table)}" = ${table}._.name;`)
    .join("\n")}`,
);

let program: ts.Program;

// One server program over every probe: the server's compiler options and its `@orb/db` resolution.
beforeAll(async () => {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(ROOT, "packages/server/tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  const options = { ...(parsed?.options ?? {}), noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const sources = new Map(probes.map(({ path, source }) => [join(ROOT, path), source]));
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined => {
    const source = sources.get(name);
    return source === undefined ? read(name, version, onError, create) : ts.createSourceFile(name, source, version, true, ts.ScriptKind.TS);
  };
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => sources.has(name) || exists(name);
  program = ts.createProgram([...sources.keys()], options, host);
  await eslint.calculateConfigForFile(join(ROOT, PROBE_DIR, "zz.ts"));
}, TIMEOUT);

async function counts({ path, source }: Probe): Promise<Readonly<Record<string, number>>> {
  const fileName = join(ROOT, path);
  const config = await resolvedConfig(eslint, fileName);
  const rules = Object.fromEntries(RULES.flatMap((rule) => (config.rules[rule] === undefined ? [] : [[rule, config.rules[rule]]])));
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: [program] } },
      rules,
    },
    { filename: fileName },
  );
  expect(
    messages.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return Object.fromEntries(RULES.map((rule) => [rule, messages.filter(({ ruleId }) => ruleId === rule).length]));
}

// The first semantic check pays for the program's type pass.
test("every probe compiles, so each refusal is of real drizzle code", CASE_TIMEOUT, () => {
  const errors = probes.flatMap(({ path }) =>
    program
      .getSemanticDiagnostics(program.getSourceFile(join(ROOT, path)))
      .map((diagnostic) => `${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`),
  );
  expect(errors).toEqual([]);
});

test("each owned table's SQL name is its binding in snake case, as the raw SQL door assumes", CASE_TIMEOUT, () => {
  const file = program.getSourceFile(join(ROOT, names.path));
  expect(program.getSemanticDiagnostics(file).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))).toEqual([]);
});

test(
  "an owned table read through the relational door or named in raw SQL is refused by its row alone, and a non-table spelling passes",
  CASE_TIMEOUT,
  async () => {
    const actual: unknown[] = [];
    const expected: unknown[] = [];
    for (const { rule, table, form, count, probe: made } of cases) {
      const found = await counts(made);
      actual.push({ table, form, counts: found });
      expected.push({ table, form, counts: Object.fromEntries(RULES.map((each) => [each, each === rule ? count : 0])) });
    }
    expect(actual).toEqual(expected);
  },
);

test("the owning home reads its table through the relational door", CASE_TIMEOUT, async () => {
  expect((await counts(home))["orb/settings-kv-owner"]).toBe(0);
});
