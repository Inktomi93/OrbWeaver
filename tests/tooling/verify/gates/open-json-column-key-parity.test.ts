// #1802 — a `json_each(…) AS <alias>` alias is a table-valued function, not a table: its `.value` / `.key` /
// `.type` are the virtual columns of that row, never a drizzle column. `resolveSqlRef` used to fall back to
// pooling every drizzle column NAMED `value`, so `json_extract(element.value, '$.k')` was attributed to the
// open `settings.value` blob and any key that blob's writers do not spell went RED — a LYING INSTRUMENT whose
// verdict depended on what else had contributed to the pooled vocabulary that run.
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const SETTINGS_SCHEMA = 'export const settings = sqliteTable("settings", {\n  value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),\n});\n';
const SETTINGS_WRITER = "export async function save(db) {\n  await db.insert(settings).values({ value: { theme: 1 } });\n}\n";

function findings(reader: string): readonly Finding[] {
  const { project, root } = ctxFor({
    "packages/db/src/schema/settings.ts": SETTINGS_SCHEMA,
    "packages/server/src/domain/settings/persistence/write.ts": SETTINGS_WRITER,
    "packages/server/src/domain/automation/persistence/migrate.ts": reader,
  });
  return (
    runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    }).gates[0]?.findings ?? []
  );
}

test("a json_each(...) AS alias's .value is the virtual row, never the pooled `value` column (#1391's original spelling)", () => {
  const reader =
    "export async function arms(db) {\n  return await db.all(sql`select element.key from json_each(actions_json) as element where json_extract(element.value, '$.type') = 'tool'`);\n}\n";
  expect(findings(reader)).toEqual([]);
});

test("the alias binds through nested parens and an interpolated column too", () => {
  const reader =
    "export async function arms(db, col) {\n  return await db.all(sql`select 1 from json_each(json_extract(${col}, '$.actions')) as element where json_extract(element.value, '$.name') = 'x'`);\n}\n";
  expect(findings(reader)).toEqual([]);
});

test("POSITIVE CONTROL — a bare `value` read is still pooled onto the open settings.value column", () => {
  const reader = "export async function bad(db) {\n  return await db.all(sql`select 1 from settings where json_extract(value, '$.zzz') is not null`);\n}\n";
  const found = findings(reader);
  expect(found).toHaveLength(1);
  expect(found[0]?.token).toBe("settings.value:zzz");
});
