import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { purgeDisallowedImageRows } from "../persistence/queries.ts";

/** Remove derived image vectors whose source kind no longer belongs to the indexing policy. */
export function createPurgeDisallowedImages(ctx: EmbeddingsContext): EmbeddingsService["purgeDisallowedImages"] {
  return () => purgeDisallowedImageRows(ctx.db);
}
