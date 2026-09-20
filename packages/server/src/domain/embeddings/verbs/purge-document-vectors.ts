// Document-sweep terminal. It records the generation pinned before reindex began; the shared promotion
// transaction retires older vectors only after cards, memory, and documents all return the same receipt.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeDocumentVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { markGenerationComplete } from "../persistence/space-state.ts";

export function createPurgeDocumentVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeDocumentVectors"] {
  return async ({ ownerId, generation }): Promise<PurgeDocumentVectorsResult> => {
    await markGenerationComplete(ctx.db, { ownerId, scope: "documents", generation, now: ctx.now() });
    return { chunks: 0 };
  };
}
