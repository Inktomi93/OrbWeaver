import type { ReconcileStatsResult } from "@orb/contracts/stats";
import type { DatabaseHandle } from "@orb/db/wiring";
import { batchForOwner, databaseForOwner } from "@orb/db/wiring-owner";
import type { IdSource } from "@orb/kit/ids";
import type { ReconcileOpts } from "../contract/rebuild-from-canon.ts";
import type { StatsBatchWiring } from "../contract/wiring.ts";
import { reconcileStats as rebuildStats } from "../persistence/rebuild-from-canon.ts";
import { settleRetainedChatRebase } from "../persistence/retained-chat-accounting.ts";
import { applyCharacterStatsDelta, applyStatsDelta, bumpStatsCanonVersion } from "./apply-delta.ts";

/** Append through the operation's exact DB and mutable batch, never a captured root connection. */
export function createStatsBatchWiring(idSource: IdSource): StatsBatchWiring {
  return {
    applyStatsDelta: (batch, db, delta) => applyStatsDelta(batchForOwner(batch), databaseForOwner(db), delta, idSource),
    applyCharacterStatsDelta: (batch, db, delta) => applyCharacterStatsDelta(batchForOwner(batch), databaseForOwner(db), delta, idSource),
    settleRetainedChatRebase: (batch, db, scope) => settleRetainedChatRebase(batchForOwner(batch), databaseForOwner(db), scope),
    bumpStatsCanonVersion: (batch, db, ownerId) => bumpStatsCanonVersion(batchForOwner(batch), databaseForOwner(db), ownerId),
  };
}

/** Preserve the complete rebuild options and import settlement semantics behind the query owner. */
export function reconcileStats(db: DatabaseHandle, options: ReconcileOpts): Promise<ReconcileStatsResult> {
  return rebuildStats(databaseForOwner(db), options);
}
