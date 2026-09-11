// The #769 pin for `owner-scoped-upserts` — the writes half's twin. The alias resolver is SHARED
// (`lib/tenancy-read.ts`), so the declaration-kind blindness walked both gates at once: `const table = t`
// resolved, `let`/`var` did not, and an unresolvable insert target returned CLEAN. Red-first against HEAD
// before the fix: every case below returned zero findings beside a passing `const` control.
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const OWNER_TABLE = 'export const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n';
const MEMBER_TABLE = 'export const chatLocks = sqliteTable("chat_locks", { chatId: text("chat_id") });\n';
const UPSERT_FILE = "packages/server/src/domain/plugin/persistence/plugin-kv.ts";

function findings(source: string, schema = OWNER_TABLE): readonly Finding[] {
  const { project, root } = ctxFor({ "packages/db/src/schema/plugin.ts": schema, [UPSERT_FILE]: source });
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

/** The same ownerless-conflict-target upsert, reached through an alias declared with each keyword. */
function aliasedUpsert(keyword: string): string {
  return `import { pluginKv } from "@orb/db";\n${keyword} table = pluginKv;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], set: { value: entry.value } });\n}\n`;
}

for (const keyword of ["const", "let", "var"]) {
  test(`an ownerless-target upsert through a \`${keyword}\` table alias is flagged`, () => {
    expect(findings(aliasedUpsert(keyword)).map((f) => f.token)).toEqual(["table"]);
  });
}

test("a `let` alias whose setWhere carries the owner column stays clean", () => {
  expect(
    findings(
      'import { pluginKv } from "@orb/db";\nlet table = pluginKv;\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], setWhere: eq(table.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
    ),
  ).toEqual([]);
});

test("an insert target that resolves to no declared table is REPORTED, not exempted", () => {
  expect(
    findings(
      "export async function putAny(db: Db, table: AnyTable, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: table.key, set: { value: entry.value } });\n}\n",
    ).map((f) => f.token),
  ).toEqual(['unresolvable-target "table"']);
});

test("an alias CYCLE terminates as unresolvable rather than as clean", () => {
  expect(
    findings(
      'import { pluginKv } from "@orb/db";\nconst a = b;\nconst b = a;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(a).values(entry).onConflictDoUpdate({ target: a.key, set: { value: entry.value } });\n}\n',
    ).map((f) => f.token),
  ).toEqual(['unresolvable-target "a"']);
});

test("an alias of a NON-ownerId table reads fine and is out of scope, not unresolvable", () => {
  expect(
    findings(
      'import { chatLocks } from "@orb/db";\nlet table = chatLocks;\nexport async function take(db: Db, row: R) {\n  return db.insert(table).values(row).onConflictDoUpdate({ target: table.chatId, set: { holder: row.holder } });\n}\n',
      MEMBER_TABLE,
    ),
  ).toEqual([]);
});

test("a plain insert through an unresolvable target has no DO UPDATE arm to judge", () => {
  expect(findings("export async function putAny(db: Db, table: AnyTable, entry: E) {\n  return db.insert(table).values(entry);\n}\n")).toEqual([]);
});
