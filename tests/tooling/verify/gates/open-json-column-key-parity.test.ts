// #1802 — a `json_each(…) AS <alias>` alias is a table-valued function, not a table: its `.value` / `.key` /
// `.type` are the virtual columns of that row, never a drizzle column. `resolveSqlRef` used to fall back to
// pooling every drizzle column NAMED `value`, so `json_extract(element.value, '$.k')` was attributed to the
// open `settings.value` blob and any key that blob's writers do not spell went RED — a LYING INSTRUMENT whose
// verdict depended on what else had contributed to the pooled vocabulary that run.
import type { CoordinatedGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate } from "../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const SETTINGS_SCHEMA =
  'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const settings = sqliteTable("settings", {\n  value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),\n});\n';
const SETTINGS_WRITER = "export async function save(db) {\n  await db.insert(settings).values({ value: { theme: 1 } });\n}\n";
const SQLITE_ROW_PROOF =
  "export declare function text(name: string, options?: unknown): { $type<T>(): { notNull(): unknown } };\n" +
  "export declare function sqliteTable(name: string, columns: Record<string, unknown>): { $inferSelect: { key: string; value: Record<string, unknown> } };\n";

function findings(reader: string, support: Record<string, string> = {}): readonly CoordinatedGateFinding[] {
  const { project, root } = ctxFor({
    ...support,
    "packages/db/src/schema/settings.ts": SETTINGS_SCHEMA,
    "packages/server/src/domain/settings/persistence/write.ts": SETTINGS_WRITER,
    "packages/server/src/domain/automation/persistence/migrate.ts": reader,
  });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings;
}

test("a json_each(...) AS alias's .value is the virtual row, never the pooled `value` column (#1391's original spelling)", () => {
  const reader =
    "export async function arms(db) {\n  return await db.all(sql`select element.key from json_each(actions_json) as element where json_extract(element.value, '$.type') = 'tool'`);\n}\n";
  expect(findings(reader)).toEqual([]);
});

test("the alias binds through nested parens and an interpolated column too", () => {
  const reader =
    "export async function arms(db, col) {\n  return await db.all(sql`select 1 from json_each(json_extract(${" +
    "col}, '$.actions')) as element where json_extract(element.value, '$.name') = 'x'`);\n}\n";
  expect(findings(reader)).toEqual([]);
});

test("POSITIVE CONTROL — a bare `value` read is still pooled onto the open settings.value column", () => {
  const reader = "export async function bad(db) {\n  return await db.all(sql`select 1 from settings where json_extract(value, '$.zzz') is not null`);\n}\n";
  const found = findings(reader);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:zzz", operation: "open-json-key-read", token: "sql" });
});

test("generic parser values are not settings.value while an inferred settings row still reports the missing key", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'function isRecord(input: unknown): input is Record<string, unknown> { return typeof input === "object" && input !== null && !Array.isArray(input); }\n' +
    'export function isToolRegistration(value: unknown): boolean { return isRecord(value) && isRecord(value["parameters"]); }\n' +
    'export function parsePayload(payload: { value: Record<string, unknown> }): unknown { return payload.value["parameters"]; }\n' +
    'export function readSettings(row: typeof settings.$inferSelect): unknown { return (row.value as Record<string, unknown>)["parameters"]; }\n';
  const found = findings(reader);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("an inferred callback row retains settings provenance while a payload callback does not", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(rows: Array<typeof settings.$inferSelect>): unknown[] { return rows.map((row) => (row.value as Record<string, unknown>)["parameters"]); }\n' +
    'export function parse(payloads: Array<{ value: Record<string, unknown> }>): unknown[] { return payloads.map((payload) => payload.value["parameters"]); }\n';
  const found = findings(reader);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("inferred arrays of schema rows and generic payloads keep distinct provenance", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect): unknown[] { const rows = [row]; return rows.map((item) => (item.value as Record<string, unknown>)["parameters"]); }\n' +
    'export function parse(payload: { value: Record<string, unknown> }): unknown[] { const payloads = [payload]; return payloads.map((item) => item.value["parameters"]); }\n';
  const found = findings(reader);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("a narrowed union attributes only the schema branch, never the payload branch", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'type Row = typeof settings.$inferSelect | { kind: "payload"; value: Record<string, unknown> };\n' +
    'export function read(row: Row): unknown { if ("kind" in row) return row.value["parameters"]; return row.value["parameters"]; }\n';
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("a mixed inferred array attributes only its narrowed schema callback branch", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect, payload: { kind: "payload"; value: Record<string, unknown> }): unknown[] {\n' +
    "  const rows = [row, payload];\n" +
    '  return rows.map((item) => { if ("kind" in item) return item.value["parameters"]; return (item.value as Record<string, unknown>)["parameters"]; });\n' +
    "}\n";
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test.each([
  ["inline", "export function read(rows: readonly (typeof settings.$inferSelect)[])"],
  ["alias", "type Rows = readonly (typeof settings.$inferSelect)[];\nexport function read(rows: Rows)"],
  ["wrapped alias", "type Rows = (readonly (typeof settings.$inferSelect)[]);\nexport function read(rows: Rows)"],
])("a readonly schema-row array %s keeps its column origin", (_shape, parameter) => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    `${parameter}: unknown[] { return rows.map((row) => row.value["parameters"]); }\n` +
    'export function parse(rows: readonly { value: Record<string, unknown> }[]): unknown[] { return rows.map((row) => row.value["parameters"]); }\n';
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("reversed elements and immutable spreads retain each origin through both narrowed callback branches", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect, payload: { kind: "payload"; value: Record<string, unknown> }): unknown[] {\n' +
    "  const payloads = [payload];\n" +
    "  const schemaRows = [row];\n" +
    "  const rows = [...payloads, ...schemaRows];\n" +
    '  return rows.map((item) => { if ("kind" in item) return item.value["parameters"]; return item.value["parameters"]; });\n' +
    "}\n";
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test("an unresolved schema-bearing union refuses a clean verdict", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    "type Row = typeof settings.$inferSelect | Partial<typeof settings.$inferSelect>;\n" +
    'export function read(row: Row): unknown { return (row.value as Record<string, unknown>)["parameters"]; }\n';
  const { project, root } = ctxFor({
    "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF,
    "packages/db/src/schema/settings.ts": SETTINGS_SCHEMA,
    "packages/server/src/domain/settings/persistence/write.ts": SETTINGS_WRITER,
    "packages/server/src/domain/automation/persistence/migrate.ts": reader,
  });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, phase: "evaluate", message: expect.stringContaining("cannot prove schema-row origin") }]);
});

test.each([
  ["shorthand", "const { value } = row;", "value"],
  ["renamed", "const { value: blob } = row;", "blob"],
  ["literal", 'const { "value": blob } = row;', "blob"],
  ["computed literal", 'const { ["value"]: blob } = row;', "blob"],
  ["computed const", 'const key = "value"; const { [key]: blob } = row;', "blob"],
  ["immutable alias", "const { value } = row; const blob = value;", "blob"],
])("%s destructuring retains schema origin without attributing a generic payload", (_shape, binding, receiver) => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    `export function read(row: typeof settings.$inferSelect): unknown { ${binding} return (${receiver} as Record<string, unknown>)["parameters"]; }\n` +
    `export function parse(row: { value: Record<string, unknown> }): unknown { ${binding} return (${receiver} as Record<string, unknown>)["parameters"]; }\n`;
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read", line: 2 });
});

test("destructuring captures the narrowed origin in each mixed-array callback branch", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect, payload: { kind: "payload"; value: Record<string, unknown> }): unknown[] {\n' +
    "  const rows = [payload, row];\n" +
    '  return rows.map((item) => { if ("kind" in item) { const { value } = item; return value["parameters"]; }\n' +
    '    const { value: blob } = item; return blob["parameters"]; });\n' +
    "}\n";
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read", line: 5 });
});

test("a destructured column does not inherit later reassignment of its row", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect | { kind: "payload"; value: Record<string, unknown> }): unknown {\n' +
    '  if ("kind" in row) return null;\n' +
    "  const { value } = row;\n" +
    '  row = { kind: "payload", value: { parameters: 1 } };\n' +
    '  return value["parameters"];\n}\n';
  const found = findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ subject: "settings.value:parameters", operation: "open-json-key-read" });
});

test.each([
  ["default", "const { value = {} } = row;", "cannot prove destructured column origin"],
  ["dynamic property", "const { [key]: value } = row;", "cannot prove destructured column origin"],
  ["unresolved union", "const { value } = row;", "cannot prove schema-row origin"],
])("schema-bearing %s destructuring refuses instead of returning clean", (shape, binding, message) => {
  const rowType = shape === "unresolved union" ? "typeof settings.$inferSelect | Partial<typeof settings.$inferSelect>" : "typeof settings.$inferSelect";
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    `export function read(row: ${rowType}, key: string): unknown { ${binding} return (value as Record<string, unknown>)["parameters"]; }\n`;
  const { project, root } = ctxFor({
    "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF,
    "packages/db/src/schema/settings.ts": SETTINGS_SCHEMA,
    "packages/server/src/domain/settings/persistence/write.ts": SETTINGS_WRITER,
    "packages/server/src/domain/automation/persistence/migrate.ts": reader,
  });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, phase: "evaluate", message: expect.stringContaining(message) }]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("mutable destructured bindings replaced by payloads do not retain schema provenance", () => {
  const reader =
    'import { settings } from "../../../../../db/src/schema/settings.ts";\n' +
    'export function read(row: typeof settings.$inferSelect, payload: Record<string, unknown>): unknown { let { value } = row; value = payload; return value["parameters"]; }\n';
  expect(findings(reader, { "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE_ROW_PROOF })).toEqual([]);
});
