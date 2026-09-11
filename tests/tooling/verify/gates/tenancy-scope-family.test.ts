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
// REPORT IDENTITY, POSITIVE ARM. Each of the three by-id tenancy policies has its own waiver position
// (owner-scoped-reads / -writes / -upserts): a marker that names THIS policy at its own reported position
// suppresses the finding it targets. (The wrong-policy / stale / malformed report-identity cases are the
// CENTRAL engine's own proof — `ordinary-waiver.test.ts` — proved once there, not re-proved per gate; a
// per-gate negative arm here duplicated that proof and, with only the tested policy in `knownPolicies`,
// was vacuous — owner ruling 2026-09-11, #1935.)
// ---------------------------------------------------------------------------------------------------
test("owner-scoped-reads: a marker naming its own policy at this position suppresses the finding", () => {
  const waived = passOf(ownerScopedReads, {
    "packages/db/src/schema/character.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/character/persistence/queries.ts":
      'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-reads(characters): the proof stand-in reason and its end condition.\nexport async function loadById(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("owner-scoped-writes: a marker naming its own policy at this position suppresses the finding", () => {
  const waived = passOf(ownerScopedWrites, {
    "packages/db/src/schema/character.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/character/persistence/card.ts":
      'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-writes(characters): the proof stand-in reason and its end condition.\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("owner-scoped-upserts: a marker naming its own policy at this position suppresses the finding", () => {
  const waived = passOf(ownerScopedUpserts, {
    "packages/db/src/schema/plugin.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
    "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
      'import { pluginKv } from "@orb/db";\n// @orb-waive owner-scoped-upserts(pluginKv): the proof stand-in reason and its end condition.\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value }).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: entry.value } });\n}\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});
