// Continuation restore admission witnesses stay server-local and never cross the wire.

import type { messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import type { MessageVariantId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";

/** A selected continuation's immutable read witness; raw private JSON is compared, never sent on the wire. */
export interface ContinueSnapshot
  extends Readonly<
    Pick<
      typeof messageVariants.$inferSelect,
      "content" | "reasoning" | "preContinueContent" | "preContinueReasoning" | "lastContinuationContent" | "lastContinuationReasoning"
    >
  > {
  readonly variantId: MessageVariantId;
  readonly rawMetadata: string | null;
  readonly rawToolCalls: string | null;
}

/** The first-write admission witness is retained so unrelated DB failures cannot become stale refusals. */
export interface ContinueRestorePlan {
  readonly selection: SQL;
  readonly statements: BatchStmt[];
}
