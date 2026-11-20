// A prompt's extraction or caption is a paid side call whose text is never persisted, so its spend lands in the
// stats-owned spend ledger the moment the call returns: before the prompt is judged usable, and whether or not a
// picture follows, because the money is already spent.

import type { SpendLedgerKind } from "@orb/contracts/stats";
import type { BatchStmt } from "@orb/db/query";
import { batchMany } from "@orb/db/query";
import type { UserId } from "@orb/kit/ids";
import type { ImageryContext } from "../contract/service.ts";

/** Record one priced prompt call. A null or zero cost (a local model, a backend that reports none) spends nothing. */
export async function recordPromptSpend(
  ctx: Pick<ImageryContext, "db" | "now" | "recordLedgerSpend">,
  spend: { readonly kind: Extract<SpendLedgerKind, "image-extraction" | "image-caption">; readonly ownerId: UserId; readonly costUsd: number | null },
): Promise<void> {
  if (spend.costUsd === null || spend.costUsd <= 0) {
    return;
  }
  const stmts: BatchStmt[] = [];
  ctx.recordLedgerSpend(stmts, ctx.db, { kind: spend.kind, ownerId: spend.ownerId, costUsd: spend.costUsd, now: ctx.now() });
  await ctx.db.batch(batchMany(stmts));
}
