import type { EmbeddingCallRow } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import type { EmbeddingCallsOpts } from "../contract/params.ts";
import type { StatsContext, StatsService } from "../contract/service.ts";
import { readEmbeddingCalls } from "../persistence/embedding-calls.ts";

// embeddingCalls — the owner's embedding_calls history, newest first, each row naming its connection's current label.

export function createEmbeddingCalls(ctx: StatsContext): Pick<StatsService, "embeddingCalls"> {
  async function embeddingCalls(ownerId: UserId, opts?: EmbeddingCallsOpts): Promise<EmbeddingCallRow[]> {
    return await readEmbeddingCalls(ctx.db, ownerId, opts);
  }
  return { embeddingCalls };
}
