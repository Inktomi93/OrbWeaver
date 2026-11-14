import type { ReconcileStatsResult } from "@orb/contracts/stats";
import type { BootDatabaseHandle, DatabaseHandle } from "@orb/db/wiring";
import { batchForOwner, bootDatabaseForOwner, databaseForOwner } from "@orb/db/wiring-owner";
import type { IdSource } from "@orb/kit/ids";
import type { ReconcileOpts } from "../contract/rebuild-from-canon.ts";
import type { StatsBatchWiring } from "../contract/wiring.ts";
import { reconcileOwnersMissingTimeline as rebuildMissingTimelines, reconcileStats as rebuildStats } from "../persistence/rebuild-from-canon.ts";
import { settleRetainedChatRebase } from "../persistence/retained-chat-accounting.ts";
import { createPrepareCanonAdmission, createPrepareCanonRetirement } from "../persistence/retire-canon.ts";
import { applyCharacterStatsDelta, applyStatsDelta, bumpStatsCanonVersion } from "./apply-delta.ts";
import { shiftCharacterCensus } from "./character-census.ts";
import { recordLedgerSpend } from "./ledger-spend.ts";

/** Append through the operation's exact DB and mutable batch, never a captured root connection. */
export function createStatsBatchWiring(idSource: IdSource): StatsBatchWiring {
  const prepareCanonRetirement = createPrepareCanonRetirement(idSource);
  const prepareCanonAdmission = createPrepareCanonAdmission(idSource);
  return {
    applyStatsDelta: (batch, db, delta) => applyStatsDelta(batchForOwner(batch), databaseForOwner(db), delta, idSource),
    applyCharacterStatsDelta: (batch, db, delta) => applyCharacterStatsDelta(batchForOwner(batch), databaseForOwner(db), delta, idSource),
    settleRetainedChatRebase: (batch, db, scope) => settleRetainedChatRebase(batchForOwner(batch), databaseForOwner(db), scope),
    bumpStatsCanonVersion: (batch, db, ownerId) => bumpStatsCanonVersion(batchForOwner(batch), databaseForOwner(db), ownerId),
    prepareCanonRetirement: async (db, scope): ReturnType<StatsBatchWiring["prepareCanonRetirement"]> => {
      const retirement = await prepareCanonRetirement(databaseForOwner(db), scope);
      return {
        beforeDelete: (batch, batchDb) => retirement.beforeDelete(batchForOwner(batch), databaseForOwner(batchDb)),
        afterDelete: (batch, batchDb) => retirement.afterDelete(batchForOwner(batch), databaseForOwner(batchDb)),
        refused: retirement.refused,
      };
    },
    prepareCanonAdmission: async (db, room): ReturnType<StatsBatchWiring["prepareCanonAdmission"]> => {
      const admission = await prepareCanonAdmission(databaseForOwner(db), room);
      return {
        beforeSeat: (batch, batchDb) => admission.beforeSeat(batchForOwner(batch), databaseForOwner(batchDb)),
        afterSeat: (batch, batchDb) => admission.afterSeat(batchForOwner(batch), databaseForOwner(batchDb)),
        refused: admission.refused,
      };
    },
    shiftCharacterCensus: (batch, db, shift) => shiftCharacterCensus(batchForOwner(batch), databaseForOwner(db), shift),
    recordLedgerSpend: (batch, db, spend) => recordLedgerSpend(batchForOwner(batch), databaseForOwner(db), spend, idSource),
  };
}

/** Preserve the complete rebuild options and import settlement semantics behind the query owner. */
export function reconcileStats(db: DatabaseHandle, options: ReconcileOpts): Promise<ReconcileStatsResult> {
  return rebuildStats(databaseForOwner(db), options);
}

/** Boot's timeline repair keeps the rebuild's canon-stability retry behind the query owner. */
export async function reconcileOwnersMissingTimeline(db: BootDatabaseHandle, now: () => number, idSource: IdSource, signal: AbortSignal): Promise<number> {
  return await rebuildMissingTimelines(bootDatabaseForOwner(db), now, idSource, signal);
}
