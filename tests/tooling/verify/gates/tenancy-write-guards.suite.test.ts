import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { gate as ownerScopedUpserts } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const PROOF_ROW_BUDGET_MS = 2000;

test("owner-scoped-writes refuses caller-driven shared-row mutations", {
  timeout: scaledBudget(policyProofRows(ownerScopedWrites).length * PROOF_ROW_BUDGET_MS),
}, () => {
  expect(verifyPolicyProofs([ownerScopedWrites])).toEqual([]);
});

test("owner-scoped-upserts distinguishes conflict-index predicates from update guards", {
  timeout: scaledBudget(policyProofRows(ownerScopedUpserts).length * PROOF_ROW_BUDGET_MS),
}, () => {
  expect(verifyPolicyProofs([ownerScopedUpserts])).toEqual([]);
});

test("SQLite overwrites a foreign row with targetWhere but preserves it with setWhere", () => {
  using sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE themes (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT)");
  const themes = sqliteTable("themes", { id: text("id").primaryKey(), ownerId: text("owner_id"), name: text("name") });
  const db = drizzle.mock();
  const incoming = { id: "collision", ownerId: "caller", name: "replacement" };
  const targetParams = [incoming.id, incoming.ownerId, incoming.name, incoming.ownerId, incoming.name];
  const updateParams = [incoming.id, incoming.ownerId, incoming.name, incoming.name, incoming.ownerId];
  const targetWhere = db
    .insert(themes)
    .values(incoming)
    .onConflictDoUpdate({ target: themes.id, targetWhere: eq(themes.ownerId, incoming.ownerId), set: { name: incoming.name } })
    .toSQL();
  const setWhere = db
    .insert(themes)
    .values(incoming)
    .onConflictDoUpdate({ target: themes.id, setWhere: eq(themes.ownerId, incoming.ownerId), set: { name: incoming.name } })
    .toSQL();
  expect(targetWhere.params).toEqual(targetParams);
  expect(setWhere.params).toEqual(updateParams);

  const seed = sqlite.prepare("INSERT INTO themes (id, owner_id, name) VALUES (?, ?, ?)");
  const read = sqlite.prepare("SELECT id, owner_id AS ownerId, name FROM themes WHERE id = ?");
  seed.run(incoming.id, "victim", "original");
  expect(sqlite.prepare(targetWhere.sql).run(...targetParams).changes).toBe(1);
  expect(read.get(incoming.id)).toEqual({ id: incoming.id, ownerId: "victim", name: incoming.name });

  sqlite.exec("DELETE FROM themes");
  seed.run(incoming.id, "victim", "original");
  expect(sqlite.prepare(setWhere.sql).run(...updateParams).changes).toBe(0);
  expect(read.get(incoming.id)).toEqual({ id: incoming.id, ownerId: "victim", name: "original" });
});
