// Append canon and rollups in one write batch. The attribution FK is resolved inside the INSERT so a
// deleted connection cannot discard an already observed execution; scope still comes from its funder.

import type { EmbeddingBatchObservation, EmbeddingInvocationContext, EmbeddingInvocationOutcome } from "@orb/contracts/embeddings";
import { embeddingBatchObservationSchema } from "@orb/contracts/embeddings";
import { embeddingSpendDelta } from "@orb/contracts/stats";
import { embeddingCalls, userConnections } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { EmbeddingInvocationId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { EmbeddingAccountingContext } from "../contract/accounting.ts";

export async function appendEmbeddingBatch(
  ctx: EmbeddingAccountingContext,
  invocation: EmbeddingInvocationContext,
  write: { readonly invocationId: EmbeddingInvocationId; readonly batch: EmbeddingBatchObservation; readonly outcome: EmbeddingInvocationOutcome | null },
): Promise<void> {
  const { invocationId, outcome } = write;
  const fact = embeddingBatchObservationSchema.parse(write.batch);
  const now = ctx.now();
  const statements: BatchStmt[] = [
    batchStmt(
      ctx.db.insert(embeddingCalls).values({
        id: ctx.newCallId(),
        invocationId,
        ownerId: invocation.ownerId,
        connectionId: sql`(select ${userConnections.id} from ${userConnections} where ${userConnections.id} = ${invocation.connectionId} and ${userConnections.ownerId} = ${invocation.ownerId})`,
        provider: invocation.providerId,
        model: invocation.model,
        servedModel: fact.servedModel,
        wire: invocation.wire,
        task: invocation.task,
        inputCount: fact.inputCount,
        inputModalities: fact.inputModalities,
        promptTokens: fact.usage.promptTokens,
        totalTokens: fact.usage.totalTokens,
        tokenDetails: fact.tokenDetails,
        responseCache: fact.usage.responseCache ?? null,
        costUsd: fact.cost.costUsd,
        costProvenance: fact.cost.costProvenance,
        costDetails: fact.cost.costDetails,
        outcome,
        createdAt: now,
      }),
    ),
  ];
  ctx.applyStatsDelta(
    statements,
    ctx.db,
    embeddingSpendDelta({
      ownerId: invocation.ownerId,
      model: invocation.model,
      provider: invocation.providerId,
      promptTokens: fact.usage.promptTokens,
      costUsd: fact.cost.costUsd,
      now,
    }),
  );
  await ctx.db.batch(batchMany(statements));
}

export async function settleEmbeddingInvocation(
  ctx: EmbeddingAccountingContext,
  invocation: EmbeddingInvocationContext,
  invocationId: EmbeddingInvocationId,
  outcome: EmbeddingInvocationOutcome,
): Promise<void> {
  await ctx.db
    .update(embeddingCalls)
    .set({ outcome })
    .where(and(eq(embeddingCalls.ownerId, invocation.ownerId), eq(embeddingCalls.invocationId, invocationId)));
}
