// The read side of the `embedding_calls` ledger: each paid embedding or rerank call the owner made, newest first. The
// ledger row names its connection only by id, and the connection may be deleted since (the FK sets it null), so the
// label joins from `user_connections` and reads null for a gone connection.

import type { EmbeddingCallRow } from "@orb/contracts/stats";
import { STATS_LIST_MAX_LIMIT } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { embeddingCalls, userConnections } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import type { EmbeddingCallsOpts } from "../contract/params.ts";

const DEFAULT_LIMIT = 50;

export async function readEmbeddingCalls(db: Db, ownerId: UserId, opts?: EmbeddingCallsOpts): Promise<EmbeddingCallRow[]> {
  const limit = Math.min(opts?.limit ?? DEFAULT_LIMIT, STATS_LIST_MAX_LIMIT);
  const rows = await db
    .select({
      id: embeddingCalls.id,
      task: embeddingCalls.task,
      model: embeddingCalls.model,
      servedModel: embeddingCalls.servedModel,
      provider: embeddingCalls.provider,
      connectionLabel: userConnections.label,
      inputCount: embeddingCalls.inputCount,
      inputModalities: embeddingCalls.inputModalities,
      totalTokens: embeddingCalls.totalTokens,
      costUsd: embeddingCalls.costUsd,
      costProvenance: embeddingCalls.costProvenance,
      outcome: embeddingCalls.outcome,
      at: embeddingCalls.createdAt,
    })
    .from(embeddingCalls)
    .leftJoin(userConnections, eq(userConnections.id, embeddingCalls.connectionId))
    .where(eq(embeddingCalls.ownerId, ownerId))
    .orderBy(desc(embeddingCalls.createdAt), desc(embeddingCalls.id))
    .limit(limit);
  return rows;
}
