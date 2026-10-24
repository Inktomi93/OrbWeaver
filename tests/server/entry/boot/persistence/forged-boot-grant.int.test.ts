// A plain handle cast to the boot grant is refused by every cross-owner boot verb before any row moves (D335).
// The table pairs with the verb list in tests/server/entry/boot/cross-owner-boot-verbs.test-d.ts; a verb added there is added here.
// @subject packages/db/src/client/wiring-capabilities.ts
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { BootDatabaseHandle } from "@orb/db/wiring";
import { databaseHandle } from "@orb/db/wiring-driver";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { migratePluginToolWireNames as migrateAutomationArms } from "@orb/server/domain/automation";
import { backfillPluginProvenance } from "@orb/server/domain/character";
import {
  hasRedeemableInvite,
  migrateHandoffOfferVocab,
  migratePluginToolWireNames as migrateToolCallRecords,
  reclaimChatLocksOnBoot,
  repairStaleJoinSeq,
} from "@orb/server/domain/chat";
import { hasSealedCredentials } from "@orb/server/domain/credentials";
import { listEnabledAcrossOwners, readInstalledPluginSlugs } from "@orb/server/domain/plugin";
import { migrateProseSlotVocab } from "@orb/server/domain/preset";
import { createListSeedAccountIds, createSettleSessionSecret } from "@orb/server/domain/sessions";
import { ensureSeedThemes, healLegacyBackgroundPins } from "@orb/server/domain/settings";
import { reconcileOwnersMissingTimeline } from "@orb/server/domain/stats";
import { reclaimInFlightOnBoot } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { seedChatRow, seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

type ServerHarness = Awaited<ReturnType<typeof createServerHarness>>;

const RENAMES = [{ from: "plugin_old__tool", to: "plugin_new__tool" }];

// Each row reaches the verb's recovery with every other argument real, so only the grant check can refuse it.
const VERBS: readonly { readonly name: string; readonly run: (grant: BootDatabaseHandle, root: ServerHarness) => Promise<unknown> }[] = [
  { name: "listEnabledAcrossOwners", run: (grant) => listEnabledAcrossOwners(grant) },
  { name: "readInstalledPluginSlugs", run: (grant) => readInstalledPluginSlugs(grant) },
  { name: "backfillPluginProvenance", run: (grant) => backfillPluginProvenance(grant) },
  { name: "healLegacyBackgroundPins", run: (grant) => healLegacyBackgroundPins(grant) },
  { name: "ensureSeedThemes", run: (grant, root) => ensureSeedThemes(grant, root.clock.now) },
  { name: "migrateProseSlotVocab", run: (grant) => migrateProseSlotVocab(grant) },
  { name: "reconcileOwnersMissingTimeline", run: (grant, root) => reconcileOwnersMissingTimeline(grant, root.clock.now, root.idSource) },
  {
    name: "reclaimInFlightOnBoot",
    run: (grant, root) =>
      reclaimInFlightOnBoot({
        db: grant,
        contributions: root.app.workloadContributions,
        now: root.clock.now(),
        emitEvent: root.app.workloadEvents.emitWorkloadEvent,
      }),
  },
  { name: "reclaimChatLocksOnBoot", run: (grant) => reclaimChatLocksOnBoot(grant, "forged-grant-replica") },
  { name: "migrateHandoffOfferVocab", run: (grant) => migrateHandoffOfferVocab(grant) },
  { name: "chat migratePluginToolWireNames", run: (grant) => migrateToolCallRecords(grant, RENAMES) },
  { name: "repairStaleJoinSeq", run: (grant) => repairStaleJoinSeq(grant) },
  { name: "hasRedeemableInvite", run: (grant, root) => hasRedeemableInvite(grant, root.clock.now()) },
  { name: "automation migratePluginToolWireNames", run: (grant) => migrateAutomationArms(grant, RENAMES) },
  { name: "hasSealedCredentials", run: (grant) => hasSealedCredentials(grant) },
  {
    name: "createSettleSessionSecret",
    run: async (grant, root) =>
      await createSettleSessionSecret({
        db: grant,
        resolution: { kind: "absent", path: `${root.secretsDir}/session-secret` },
        hasOtherDependents: () => Promise.resolve(false),
        createKeyfile: () => null,
      })(),
  },
  { name: "createListSeedAccountIds", run: async (grant) => await createListSeedAccountIds(grant)() },
];

// Every row of every table, so a refusal that wrote anything anywhere shows up as a difference.
async function snapshotRows(db: Db): Promise<Record<string, unknown[]>> {
  const tables = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  const rows: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    rows[name] = await db.all(sql`SELECT * FROM ${sql.identifier(name)}`);
  }
  return rows;
}

// A root whose database holds a stale join floor the repair verb would clamp, so the control has a row to move.
async function rootWithStaleSeat(): Promise<ServerHarness> {
  const root = await createServerHarness();
  const chat = await seedChatRow(root.db);
  await root.db.insert(chatParticipants).values({
    id: mintTypeId(ID_PREFIX.chatParticipant),
    chatId: chat.id,
    kind: "human",
    userId: (await seedUser(root.db)).id,
    role: "member",
    joinedAt: 0,
    joinSeq: 4,
  });
  await root.settleBackground();
  return root;
}

test.for(VERBS)("$name refuses a plain handle cast to the boot grant and leaves every row unchanged", async (verb) => {
  await using root = await rootWithStaleSeat();
  // The cast is the forgery a request route could write; only a grant the mint registered may cross owners.
  const forged = databaseHandle(root.db) as BootDatabaseHandle;
  const before = await snapshotRows(root.db);

  await expect(verb.run(forged, root)).rejects.toThrow("boot wiring handle is not granted");
  expect(await snapshotRows(root.db)).toStrictEqual(before);
});

test("the row snapshot sees the write a registered grant makes", async () => {
  await using root = await rootWithStaleSeat();
  const before = await snapshotRows(root.db);

  expect(await repairStaleJoinSeq(bootGrantFor(root.db))).toBe(1);
  expect(await snapshotRows(root.db)).not.toStrictEqual(before);
});
