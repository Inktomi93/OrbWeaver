// @subject packages/db/src/client/wiring-capabilities.ts
import type { BootDatabaseHandle, DatabaseHandle } from "@orb/db/wiring";
import type { migratePluginToolWireNames as migrateAutomationArms } from "@orb/server/domain/automation";
import type { backfillPluginProvenance } from "@orb/server/domain/character";
import type {
  hasRedeemableInvite,
  migrateHandoffOfferVocab,
  migratePluginToolWireNames as migrateToolCallRecords,
  reclaimChatLocksOnBoot,
  repairStaleJoinSeq,
} from "@orb/server/domain/chat";
import type { hasSealedCredentials } from "@orb/server/domain/credentials";
import type { listEnabledAcrossOwners, readInstalledPluginSlugs } from "@orb/server/domain/plugin";
import type { migrateProseSlotVocab } from "@orb/server/domain/preset";
import type { createListSeedAccountIds, createSettleSessionSecret } from "@orb/server/domain/sessions";
import type { ensureSeedThemes, healLegacyBackgroundPins } from "@orb/server/domain/settings";
import type { reconcileOwnersMissingTimeline } from "@orb/server/domain/stats";
import type { reclaimInFlightOnBoot } from "@orb/server/domain/workloads";
import { expectTypeOf, test } from "vitest";

test("a plain wiring handle never stands in for the boot grant", () => {
  expectTypeOf<DatabaseHandle>().not.toExtend<BootDatabaseHandle>();
  expectTypeOf<BootDatabaseHandle>().toExtend<DatabaseHandle>();
});

test("every verb that crosses owners at boot demands the boot grant", () => {
  expectTypeOf<Parameters<typeof listEnabledAcrossOwners>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof readInstalledPluginSlugs>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof backfillPluginProvenance>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof healLegacyBackgroundPins>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof ensureSeedThemes>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof migrateProseSlotVocab>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof reconcileOwnersMissingTimeline>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof reclaimInFlightOnBoot>[0]["db"]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof reclaimChatLocksOnBoot>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof migrateHandoffOfferVocab>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof migrateToolCallRecords>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof repairStaleJoinSeq>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof hasRedeemableInvite>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof migrateAutomationArms>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof hasSealedCredentials>[0]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof createSettleSessionSecret>[0]["db"]>().toEqualTypeOf<BootDatabaseHandle>();
  expectTypeOf<Parameters<typeof createListSeedAccountIds>[0]>().toEqualTypeOf<BootDatabaseHandle>();
});
