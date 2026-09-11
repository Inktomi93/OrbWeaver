import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as ownerScopedReads } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { gate as ownerScopedUpserts } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { gate as tableScopingClass } from "../../../../tooling/src/verify/gates/table-scoping-class.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the tenancy-scope family (the schema classification plus its three by-id tenancy checks) self-proves", () => {
  expect(verifyPolicyProofs([tableScopingClass, ownerScopedReads, ownerScopedWrites, ownerScopedUpserts])).toEqual([]);
});

const ROOT = "/tenancy-scope-family";

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

// ---------------------------------------------------------------------------------------------------
// REPORT IDENTITY, NEGATIVE ARM. Each of the three by-id tenancy policies has its own waiver position
// (owner-scoped-reads / -writes / -upserts). A marker naming a SIBLING policy id at the exact matching
// position must not suppress the finding — the central engine binds a waiver only to the exact policy id
// it names, never to "some tenancy marker at this spot".
// ---------------------------------------------------------------------------------------------------
test("owner-scoped-reads: a marker naming owner-scoped-writes at this position suppresses nothing", () => {
  const mismatched = passOf(ownerScopedReads, {
    "packages/db/src/schema/character.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/character/persistence/queries.ts":
      'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-writes(characters): wrong gate.\nexport async function loadById(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]).toMatchObject({ policyId: "owner-scoped-reads" });
  expect(mismatched.authority.authorityAlarms).toMatchObject([
    { kind: "ordinary-waiver", message: expect.stringContaining("targets unknown policy owner-scoped-writes") },
  ]);
});

test("owner-scoped-writes: a marker naming owner-scoped-reads at this position suppresses nothing", () => {
  const mismatched = passOf(ownerScopedWrites, {
    "packages/db/src/schema/character.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/character/persistence/card.ts":
      'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-reads(characters): wrong gate.\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]).toMatchObject({ policyId: "owner-scoped-writes" });
  expect(mismatched.authority.authorityAlarms).toMatchObject([
    { kind: "ordinary-waiver", message: expect.stringContaining("targets unknown policy owner-scoped-reads") },
  ]);
});

test("owner-scoped-upserts: a marker naming owner-scoped-writes at this position suppresses nothing (the retired UPSERT-not-a-WRITE scenario)", () => {
  const mismatched = passOf(ownerScopedUpserts, {
    "packages/db/src/schema/plugin.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
      'import { pluginKv } from "@orb/db";\n// @orb-waive owner-scoped-writes(pluginKv): wrong gate.\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value }).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: entry.value } });\n}\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]).toMatchObject({ policyId: "owner-scoped-upserts" });
  expect(mismatched.authority.authorityAlarms).toMatchObject([
    { kind: "ordinary-waiver", message: expect.stringContaining("targets unknown policy owner-scoped-writes") },
  ]);
});
