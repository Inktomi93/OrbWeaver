// Memory-sweep terminal. It records the generation pinned while planning the backfill; the shared promotion
// transaction retires older vectors only after cards, memory, and documents all return the same receipt.

import type { PurgeMemoryVectorsResult } from "../contract/results.ts";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { completeGenerationScope } from "../substrate/generation.ts";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async ({ ownerId, generation, emptyScope }): Promise<PurgeMemoryVectorsResult> => {
    await completeGenerationScope(ctx, { ownerId, scope: "memory", generation, onlyIf: emptyScope });
    return { segments: 0, digests: 0 };
  };
}
