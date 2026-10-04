// Memory-sweep terminal. It records the generation pinned while planning the backfill; the shared promotion
// transaction retires older vectors only after cards, memory, and documents all return the same receipt.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeMemoryVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { completeGenerationScope } from "../substrate/generation.ts";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async ({ ownerId, generation }): Promise<PurgeMemoryVectorsResult> => {
    await completeGenerationScope(ctx, { ownerId, scope: "memory", generation });
    return { segments: 0, digests: 0 };
  };
}
