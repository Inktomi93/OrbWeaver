// The #769 pin for `owner-scoped-writes`: the alias resolver's DECLARATION-KIND blindness (a `let`/`var`
// table alias resolved to nothing, and an unresolved write target returned CLEAN), reproduced through the
// real descriptor. Red-first against HEAD before the fix: every `let`/`var`/unresolvable case below returned
// zero findings while its `const` control returned one — the exact shape of a gate that reports ✓ forever.
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const OWNER_TABLE = 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n';
const MEMBER_TABLE = 'export const chats = sqliteTable("chats", { id: text("id") });\n';
const WRITE_FILE = "packages/server/src/domain/character/persistence/card.ts";

function findings(source: string, schema = OWNER_TABLE): readonly Finding[] {
  const { project, root } = ctxFor({ "packages/db/src/schema/character.ts": schema, [WRITE_FILE]: source });
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

/** The same unscoped by-id UPDATE, reached through an alias declared with each keyword. */
function aliasedWrite(keyword: string): string {
  return `import { characters } from "@orb/db";\n${keyword} table = characters;\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n`;
}

for (const keyword of ["const", "let", "var"]) {
  test(`an unscoped by-id write through a \`${keyword}\` table alias is flagged`, () => {
    expect(findings(aliasedWrite(keyword)).map((f) => f.token)).toEqual(["table"]);
  });
}

test("a `let` alias whose WHERE carries the owner column stays clean", () => {
  expect(
    findings(
      'import { characters } from "@orb/db";\nlet table = characters;\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(table).set({ name }).where(and(eq(table.id, id), eq(table.ownerId, ownerId)));\n}\n',
    ),
  ).toEqual([]);
});

test("a write target that resolves to no declared table is REPORTED, not exempted", () => {
  expect(
    findings(
      "export async function renameAny(db: Db, table: AnyTable, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n",
    ).map((f) => f.token),
  ).toEqual(['unresolvable-target "table"']);
});

test("an alias CYCLE terminates as unresolvable rather than as clean", () => {
  expect(
    findings(
      'import { characters } from "@orb/db";\nconst a = b;\nconst b = a;\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(a).set({ name }).where(eq(a.id, id));\n}\n',
    ).map((f) => f.token),
  ).toEqual(['unresolvable-target "a"']);
});

test("an alias of a NON-ownerId table reads fine and is out of scope, not unresolvable", () => {
  expect(
    findings(
      'import { chats } from "@orb/db";\nlet table = chats;\nexport async function touch(db: Db, id: string) {\n  return db.update(table).set({ updatedAt: 1 }).where(eq(table.id, id));\n}\n',
      MEMBER_TABLE,
    ),
  ).toEqual([]);
});

test("a chain-free `Map.delete(key)` is not mistaken for an unbounded drizzle delete", () => {
  expect(findings("export function evict(cache: Map<string, E>, oldest: string) {\n  return cache.delete(oldest);\n}\n")).toEqual([]);
});
