// The one write of the spend ledger: a priced call with no canon row of its own lands its `spend_ledger` row and its
// live delta in the caller's batch, built by the same `ledgerSpendDelta` the rebuild folds the row with, so the live
// write and a "Recompute now" cannot disagree.

import type { LedgerSpend } from "@orb/contracts/stats";
import { ledgerSpendDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { spendLedger } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { IdSource } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { applyStatsDelta } from "./apply-delta.ts";

export function recordLedgerSpend(batch: BatchStmt[], db: Db, spend: LedgerSpend, idSource: IdSource): void {
  batch.push(
    batchStmt(
      db.insert(spendLedger).values({
        id: idSource.typeId(ID_PREFIX.spendLedger),
        ownerId: spend.ownerId,
        kind: spend.kind,
        costUsd: spend.costUsd,
        createdAt: spend.now,
      }),
    ),
  );
  applyStatsDelta(batch, db, ledgerSpendDelta(spend), idSource);
}
