import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as membershipWriteFan } from "../../../../tooling/src/verify/gates/membership-write-fan.ts";
import { gate as ownerScopedReads } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { gate as ownerScopedUpserts } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

// A reads proof row runs up to about 1.4 s while the box is below its load threshold, where the budget does not stretch.
const PROOF_ROW_BUDGET_MS = 2000;

test("owner-scoped-reads preserves every declared owned-scope and every-owner authority proof", {
  timeout: scaledBudget(policyProofRows(ownerScopedReads).length * PROOF_ROW_BUDGET_MS),
}, () => {
  expect(verifyPolicyProofs([ownerScopedReads])).toEqual([]);
});

const ROOT = "/tenancy-scope-family";

function passOf(
  policy: GatePolicy,
  files: Readonly<Record<string, string>>,
  reviewedGrants: Parameters<typeof runPolicyPass>[0]["reviewedGrants"] = [],
  nativeRoot?: string,
): ReturnType<typeof runPolicyPass> {
  const root = nativeRoot === undefined ? ROOT : join(nativeRoot, ".orb-tenancy-identity-control");
  const project = new Project(
    nativeRoot === undefined
      ? { useInMemoryFileSystem: true }
      : {
          skipAddingFilesFromTsConfig: true,
          compilerOptions: {
            strict: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            paths: { "@orb/db": [join(root, "packages/db/src/index.ts")] },
          },
        },
  );
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  if (nativeRoot !== undefined) {
    project.createSourceFile(
      join(root, "packages/db/src/index.ts"),
      'export*from"./schema/character.ts";import*as schema from"./schema/character.ts";import type{LibSQLDatabase}from"drizzle-orm/libsql";export type Db=LibSQLDatabase<typeof schema>;',
    );
    project.createSourceFile(join(root, "fixture-db.d.ts"), 'type Db=import("@orb/db").Db;');
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants,
    failOnWarnings: false,
  });
}

for (const config of [
  'target: themes.id, setWhere: isNull(themes.ownerId), set: { name: "Shipped" }',
  'target: [themes.ownerId, themes.id], set: { name: "Shipped" }',
  'target: themes.id, setWhere: eq(themes.ownerId, "caller"), set: { name: "Shipped" }',
]) {
  test(`owner-scoped-upserts: opaque outer config contribution is UNKNOWN before acquitting ${config}`, () => {
    const result = passOf(ownerScopedUpserts, {
      "packages/db/src/schema/theme.ts":
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themes = sqliteTable("themes", { id: text("id").primaryKey(), ownerId: text("owner_id"), name: text("name") });\n',
      "packages/server/src/domain/settings/persistence/theme-queries.ts": `import { eq, isNull } from "drizzle-orm";\nimport { themes } from "@orb/db";\nexport function seed(db: Db) { const config = loadConfig(); return db.insert(themes).values({ id: "shipped", ownerId: null, name: "Shipped" }).onConflictDoUpdate({ ${config}, ...config }); }\n`,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.policies.flatMap(({ analysis }) => analysis?.unknown ?? [])).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("upsert-config-provenance") }),
    ]);
  });
}

for (const policy of [ownerScopedWrites, ownerScopedUpserts]) {
  test.each([
    { label: "clock call", payload: '{ name: "Shipped", updatedAt: now() }' },
    { label: "timestamp parameter", payload: '{ name: "Shipped", updatedAt: at }' },
    { label: "escaped composite alias", payload: "patch" },
  ])(`${policy.id}: $label is explicit UNKNOWN, never caller authority`, ({ payload }) => {
    const write =
      policy === ownerScopedWrites
        ? `db.update(themes).set(${payload}).where(and(eq(themes.id, "shipped"), isNull(themes.ownerId)))`
        : `db.insert(themes).values({ id: "shipped", ownerId: null, name: "Shipped" }).onConflictDoUpdate({ target: themes.id, setWhere: isNull(themes.ownerId), set: ${payload} })`;
    const result = passOf(policy, {
      "packages/db/src/schema/theme.ts":
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themes = sqliteTable("themes", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
      "packages/server/src/domain/settings/persistence/theme-queries.ts": `import { and, eq, isNull } from "drizzle-orm";\nimport { themes } from "@orb/db";\nexport function seed(db: Db, now: () => number, at: number) { const patch = { name: "Shipped", updatedAt: 0 }; mutate(patch); return ${write}; }\n`,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.policies.flatMap(({ analysis }) => analysis?.unknown ?? [])).toEqual([
      expect.objectContaining({
        file: "packages/server/src/domain/settings/persistence/theme-queries.ts",
        reason: expect.stringContaining("system-write-provenance"),
      }),
    ]);
  });
}

// ---------------------------------------------------------------------------------------------------
// REPORT IDENTITY, POSITIVE ARM. Each of the three by-id tenancy policies has its own waiver position
// (owner-scoped-reads / -writes / -upserts): a marker that names THIS policy at its own reported position
// suppresses the finding it targets. (The wrong-policy / stale / malformed report-identity cases are the
// CENTRAL engine's own proof — `ordinary-waiver.test.ts` — proved once there, not re-proved per gate; a
// per-gate negative arm here duplicated that proof and, with only the tested policy in `knownPolicies`,
// was vacuous — owner ruling 2026-09-11, #1935.)
// ---------------------------------------------------------------------------------------------------
test("owner-scoped-reads: a marker naming its own policy at this position suppresses the finding", ({ repoRoot }) => {
  const waived = passOf(
    ownerScopedReads,
    {
      "packages/db/src/schema/character.ts":
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id:text("id").primaryKey(), ownerId: text("owner_id") });\n',
      "packages/server/src/domain/character/persistence/queries.ts":
        'import{eq}from"drizzle-orm";import { characters } from "@orb/db";\n// @orb-waive owner-scoped-reads(characters): the proof stand-in reason and its end condition.\nexport async function loadById(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
    },
    [],
    repoRoot,
  );

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

// ---------------------------------------------------------------------------------------------------
// `membership-write-fan` (#1734) — THE REAL CENTRAL GRANT TABLE, now EMPTY (#2471). The policy's declared
// `grant:` witness is a SYNTHETIC row conformance builds from authored strings, which proves the emitted
// `(subject, operation)` is bindable but says nothing about `lib/reviewed-grants.ts` actually carrying it
// (§6.2). These arms drive the REAL table through `reviewedGrantsFor`, at the REAL authored path of the
// site that table used to license.
//
// RETARGETED FROM THE GRANT TO ITS RETIREMENT. Until 2026-09-20 the table carried
// `membership-write-fan:databank-{attach-to-chat,detach-from-chat}` — one owner-deferred gap (bridge design
// §8 + fork F-E). The owner closed the fork, both verbs gained `emitRoomDatabankChanged`, and the two rows
// were retired in the same commit. So the pair below pins the state that REPLACED the grant: the SHIPPED
// shape (a room fan beside the per-person emit) is ACQUITTED and needs no grant, and the PRE-FIX shape at
// the same real path is now an EFFECTIVE finding that nothing licenses. Re-committing either row without a
// live finding would red these arms rather than quietly outliving its reason.
// ---------------------------------------------------------------------------------------------------
const CHAT_DOCUMENTS_SCHEMA =
  'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n';
const DATABANK_ATTACH = "packages/server/src/domain/databank/verbs/attach/attach-to-chat.ts";
/** The PRE-#2471 shape: a membership-class write whose only announcement is the per-person emit. */
const DATABANK_ATTACH_UNFANNED =
  'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n';
/** The SHIPPED shape: the room fan beside it — the acquittal this policy's own FIX string describes. */
const DATABANK_ATTACH_FANNED = DATABANK_ATTACH_UNFANNED.replace(
  "    ctx.emitUserEvent(ownerId,",
  "    ctx.emitRoomDatabankChanged(chatId);\n    ctx.emitUserEvent(ownerId,",
);

test("membership-write-fan: the SHIPPED databank attach is acquitted by its ROOM FAN — no finding, no grant", () => {
  const { authority } = passOf(
    membershipWriteFan,
    { "packages/db/src/schema/databank.ts": CHAT_DOCUMENTS_SCHEMA, [DATABANK_ATTACH]: DATABANK_ATTACH_FANNED },
    reviewedGrantsFor([membershipWriteFan]),
  );

  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.grantedFindings).toEqual([]);
  // The acquittal is the ROOM FAN, not an exemption: the central table carries no row that could license
  // this site, so a regression that dropped the fan lands in the arm below rather than staying silent here.
  expect(authority.authorityAlarms).toEqual([]);
});

test("membership-write-fan: the PRE-FIX shape at the same real path is EFFECTIVE — the retired grant licenses nothing", () => {
  const { authority } = passOf(
    membershipWriteFan,
    { "packages/db/src/schema/databank.ts": CHAT_DOCUMENTS_SCHEMA, [DATABANK_ATTACH]: DATABANK_ATTACH_UNFANNED },
    reviewedGrantsFor([membershipWriteFan]),
  );

  expect(authority.effectiveFindings.map((finding) => finding.subject)).toEqual([`${DATABANK_ATTACH}#chatDocuments`]);
  expect(authority.grantedFindings).toEqual([]);
  expect(authority.authorityAlarms).toEqual([]);
});
