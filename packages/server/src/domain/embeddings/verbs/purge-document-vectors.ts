// Document-sweep terminal. It records the generation pinned before reindex began; the shared promotion
// transaction retires older vectors only after cards, memory, and documents all return the same receipt.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeDocumentVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { completeGenerationScope } from "../substrate/generation.ts";

export function createPurgeDocumentVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeDocumentVectors"] {
  return async ({ ownerId, generation }): Promise<PurgeDocumentVectorsResult> => {
    await completeGenerationScope(ctx, { ownerId, scope: "documents", generation });
    return { chunks: 0 };
  };
}
