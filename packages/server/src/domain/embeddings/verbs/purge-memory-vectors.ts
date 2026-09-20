// Memory-sweep terminal. It records the generation pinned while planning the backfill; the shared promotion
// transaction retires older vectors only after cards, memory, and documents all return the same receipt.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeMemoryVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { markGenerationComplete } from "../persistence/space-state.ts";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async ({ ownerId, generation }): Promise<PurgeMemoryVectorsResult> => {
    await markGenerationComplete(ctx.db, { ownerId, scope: "memory", generation, now: ctx.now() });
    return { segments: 0, digests: 0 };
  };
}
