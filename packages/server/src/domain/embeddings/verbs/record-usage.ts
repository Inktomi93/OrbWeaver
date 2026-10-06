// A failed logical invocation may have completed paid batches. Their append survives the failure;
// later concurrently observed batches inherit the settled outcome rather than becoming fake successes.

import type { BeginEmbeddingAccounting, EmbeddingInvocationOutcome } from "@orb/contracts/embeddings";
import type { EmbeddingAccountingContext } from "../contract/accounting.ts";
import { appendEmbeddingBatch, settleEmbeddingInvocation } from "../persistence/usage-write.ts";

export function createRecordUsage(ctx: EmbeddingAccountingContext): BeginEmbeddingAccounting {
  return (invocation) => {
    const invocationId = ctx.newInvocationId();
    let outcome: EmbeddingInvocationOutcome | null = null;
    let pending = Promise.resolve();
    const appends: Promise<void>[] = [];
    return {
      recordBatch: (batch): Promise<void> => {
        const append = pending.then(() => appendEmbeddingBatch(ctx, invocation, { invocationId, batch, outcome }));
        appends.push(append);
        // Recover only the queue, never the caller's append promise: an earlier durable-write failure
        // must not suppress a different already-observed physical batch or repeat provider work.
        // @orb-waive caught-failure-ownership(append): queue recovery never replaces the original returned append, which finish also joins via appends; ends if either failure propagation path is removed.
        pending = append.catch(() => undefined);
        return append;
      },
      finish: async (success): Promise<void> => {
        outcome = success ? "completed" : "failed";
        await pending;
        await settleEmbeddingInvocation(ctx, invocation, invocationId, outcome);
        await Promise.all(appends);
      },
    };
  };
}
