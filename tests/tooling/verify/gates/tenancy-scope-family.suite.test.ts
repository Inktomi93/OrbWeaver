import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as membershipWriteFan } from "../../../../tooling/src/verify/gates/membership-write-fan.ts";
import { gate as ownerScopedReads } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { gate as ownerScopedUpserts } from "../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { gate as tableScopingClass } from "../../../../tooling/src/verify/gates/table-scoping-class.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { TABLE_SCOPING_ROWS, tableScopingClasses } from "../../../../tooling/src/verify/lib/tenancy-scope.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the tenancy-scope family (the schema classification, its three by-id tenancy checks, and the membership-write fan) self-proves", () => {
  expect(verifyPolicyProofs([tableScopingClass, ownerScopedReads, ownerScopedWrites, ownerScopedUpserts, membershipWriteFan])).toEqual([]);
});

const ROOT = "/tenancy-scope-family";

function passOf(
  policy: GatePolicy,
  files: Readonly<Record<string, string>>,
  reviewedGrants: Parameters<typeof runPolicyPass>[0]["reviewedGrants"] = [],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants, failOnWarnings: false });
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

// ---------------------------------------------------------------------------------------------------
// THE REGISTRY MOVE (#2096 / §12.3, arm 3 — owner ruling 2026-09-12). `TABLE_SCOPING_ROWS` moved from
// `gates/table-scoping-class.ts` into `lib/tenancy-scope.ts` as a RECORD ARRAY (the SQL name is a VALUE,
// not an object KEY) so `useNamingConvention`, which is off for `gates/**` and on for `lib/**`, has
// nothing to rename. Two things need pinning that no proof row can express.
//
// 1. THE RESHAPE ITSELF. Turning 97 object keys into 97 record values is exactly the edit that silently
//    drops or duplicates a row, and `tsc` cannot see it: both shapes compile with any number of rows.
//    So the set is asserted DERIVED-vs-DECLARED — the Map the one reader builds must have exactly as
//    many entries as the array has rows, which is false the moment two rows share a table name.
//    Deliberately NOT a literal `97`: pinning the count makes ADDING A TABLE a red proof, which is
//    `countFrom`'s lesson one layer over (§4.1 — a rule whose effect is "classifying a table correctly
//    breaks the build"). The count belongs to the schema, and the gate's own two-sided arms below are
//    what police it against the schema.
//
// 2. THE TWO-SIDED RATCHET, BOTH SIDES. `reportStaleRows` is guarded on the REAL schema barrel being in
//    the loaded population, so a `mustFlag` row structurally cannot reach it — a conformance mini-project
//    declares one table and would otherwise "prove" every other row dead. Both plants therefore live here,
//    driven through `runPolicyPass` with a fixture AT the barrel path.
// ---------------------------------------------------------------------------------------------------
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** A drizzle table declaration at the schema barrel, in the shape the shared schema fact discovers. */
function schemaBarrel(tables: readonly { readonly ident: string; readonly sql: string; readonly cols: string }[]): string {
  const head = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';
  return head + tables.map(({ ident, sql, cols }) => `export const ${ident} = sqliteTable("${sql}", {\n${cols}\n});\n`).join("");
}

const ID_COL = '  id: text("id").primaryKey(),';
const OWNER_COL = '  ownerId: text("owner_id").notNull(),';

test("the registry reshape dropped and duplicated NOTHING — the reader's Map and the row array agree", () => {
  const rows = TABLE_SCOPING_ROWS;
  const byName = tableScopingClasses();

  // Two-sided: every row reaches the Map, and the Map holds nothing the array does not.
  expect(byName.size).toBe(rows.length);
  expect([...byName.keys()].toSorted()).toEqual(rows.map(({ table }) => table).toSorted());
  for (const row of rows) {
    expect(byName.get(row.table)).toBe(row);
  }

  // The property the KEY->VALUE reshape could have broken and tsc cannot see: a duplicated table name
  // compiles fine as an array and silently collapses in the Map.
  expect(new Set(rows.map(({ table }) => table)).size).toBe(rows.length);
});

test("RATCHET SIDE 1 — a schema table with NO registry row is reported UNCLASSIFIED (the planted EXTRA table)", () => {
  const result = passOf(tableScopingClass, {
    [SCHEMA_BARREL]: schemaBarrel([
      { ident: "chats", sql: "chats", cols: ID_COL },
      { ident: "plantedExtra", sql: "planted_extra_table", cols: `${ID_COL}\n${OWNER_COL}` },
    ]),
  });

  const unclassified = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("classify it") === true);
  expect(unclassified).toHaveLength(1);
  expect(unclassified[0]?.token).toBe('"planted_extra_table"');
});

test("RATCHET SIDE 2 — a registry row the schema no longer declares is reported STALE (the planted MISSING table)", () => {
  // The barrel declares `chats` and nothing else, so every OTHER registry row is a table the schema does
  // not declare — which is precisely the stale side, at scale.
  const result = passOf(tableScopingClass, {
    [SCHEMA_BARREL]: schemaBarrel([{ ident: "chats", sql: "chats", cols: ID_COL }]),
  });

  const stale = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("declares no such table") === true);

  // BOTH directions, so this is a measurement and not a count: every registry row EXCEPT the one the
  // fixture declares is named stale, and the declared one is NOT.
  expect(stale).toHaveLength(TABLE_SCOPING_ROWS.length - 1);
  const named = stale.map((finding) => finding.message ?? "").join("\n");
  expect(named).toContain("automation_rules");
  expect(named).not.toContain('"chats"');
});

// ---------------------------------------------------------------------------------------------------
// `membership-write-fan` (#1734) — THE REAL CENTRAL GRANT TABLE. The policy's declared `grant:` witness is
// a SYNTHETIC row conformance builds from authored strings, which proves the emitted `(subject, operation)`
// is bindable but says nothing about `lib/reviewed-grants.ts` actually carrying it (§6.2). These two arms
// drive the REAL table through `reviewedGrantsFor`, at the REAL authored path of the owner-deferred site —
// so deleting or misspelling either committed row reds here rather than silently un-licensing a live
// finding at the next whole run.
// ---------------------------------------------------------------------------------------------------
const CHAT_DOCUMENTS_SCHEMA =
  'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatDocuments = sqliteTable("chat_documents", { chatId: text("chat_id"), documentId: text("document_id") });\n';
const DATABANK_ATTACH = "packages/server/src/domain/databank/verbs/attach/attach-to-chat.ts";
const DATABANK_ATTACH_SOURCE =
  'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n';

test("membership-write-fan: the COMMITTED grant licenses the owner-deferred databank attach exactly once", () => {
  const { authority } = passOf(
    membershipWriteFan,
    { "packages/db/src/schema/databank.ts": CHAT_DOCUMENTS_SCHEMA, [DATABANK_ATTACH]: DATABANK_ATTACH_SOURCE },
    reviewedGrantsFor([membershipWriteFan]),
  );

  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.grantedFindings.map((granted) => granted.grantId)).toEqual(["membership-write-fan:databank-attach-to-chat"]);
  // EXACTLY ONE consumption: a grant matching two candidates licenses NEITHER and alarms over-broad, which
  // is why the policy reports once per FILE rather than once per per-person emit.
  expect(authority.reviewedGrantConsumption.filter((row) => row.count > 0).map((row) => row.count)).toEqual([1]);
});

test("membership-write-fan: the same site at ANOTHER path is NOT licensed — the grant is path-exact", () => {
  // The acquittal's falsifier. Without it the first arm passes just as well against a grant that licenses
  // the whole policy, and the deferral would quietly become a blanket exemption for every domain.
  const neighbour = "packages/server/src/domain/databank/verbs/attach/attach-to-other-chat.ts";
  const { authority } = passOf(
    membershipWriteFan,
    { "packages/db/src/schema/databank.ts": CHAT_DOCUMENTS_SCHEMA, [neighbour]: DATABANK_ATTACH_SOURCE },
    reviewedGrantsFor([membershipWriteFan]),
  );

  expect(authority.effectiveFindings.map((finding) => finding.subject)).toEqual([`${neighbour}#chatDocuments`]);
  expect(authority.grantedFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant", "stale-reviewed-grant"]);
});
