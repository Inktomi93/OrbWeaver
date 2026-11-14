// Chat owns conversion of inert assembly operands into its private query/accounting context.

import type { CanonAdmission, CanonRetirement } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchHandle, databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatContext } from "./contract/context.ts";
import type { ChatAssemblyContext } from "./contract/wiring.ts";

/**
 * Preserve each operation's mutable batch across the accounting seam.
 * @remarks The seam receives the handle the caller supplied, never a re-minted one: every verb passes `ctx.db`,
 * which is the connection `input.db` names, so the handle and the operation's connection are the same.
 */
export function createChatContext(input: ChatAssemblyContext): ChatContext {
  return {
    ...input,
    db: databaseForOwner(input.db),
    applyStatsDelta: (batch, _db, delta) => input.applyStatsDelta(batchHandle(batch), input.db, delta),
    applyCharacterStatsDelta: (batch, _db, delta) => input.applyCharacterStatsDelta(batchHandle(batch), input.db, delta),
    settleRetainedChatRebase: (batch, _db, scope) => input.settleRetainedChatRebase(batchHandle(batch), input.db, scope),
    bumpStatsCanonVersion: (batch, _db, ownerId) => input.bumpStatsCanonVersion(batchHandle(batch), input.db, ownerId),
    shiftCharacterCensus: (batch, _db, shift) => input.shiftCharacterCensus(batchHandle(batch), input.db, shift),
    recordLedgerSpend: (batch, _db, spend) => input.recordLedgerSpend(batchHandle(batch), input.db, spend),
    prepareCanonRetirement: async (_db, scope): Promise<CanonRetirement<BatchStmt[], Db>> => {
      const retirement = await input.prepareCanonRetirement(input.db, scope);
      return {
        beforeDelete: (batch) => retirement.beforeDelete(batchHandle(batch), input.db),
        afterDelete: (batch) => retirement.afterDelete(batchHandle(batch), input.db),
        refused: retirement.refused,
      };
    },
    prepareCanonAdmission: async (_db, room): Promise<CanonAdmission<BatchStmt[], Db>> => {
      const admission = await input.prepareCanonAdmission(input.db, room);
      return {
        beforeSeat: (batch) => admission.beforeSeat(batchHandle(batch), input.db),
        afterSeat: (batch) => admission.afterSeat(batchHandle(batch), input.db),
        refused: admission.refused,
      };
    },
  };
}
