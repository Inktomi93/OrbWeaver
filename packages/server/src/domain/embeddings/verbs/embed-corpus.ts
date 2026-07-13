// verb: embedCorpus — bulk text catch-up sweep, driven by the embed-corpus workload. Enumerates characters
// and routes each through the one write path (store). Resumable via store's content_hash short-circuit
// (force bypasses it); cooperative abort between items, every completed item durable + idempotent; an embed
// failure propagates so the rerun resumes.

import type { EmbedPassParams } from "../contract/params";
import type { BulkEmbedResult } from "../contract/results";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service";

export function createEmbedCorpus(
  ctx: EmbeddingsContext,
  deps: { readonly store: EmbeddingsService["store"] },
): EmbeddingsService["embedCorpus"] {
  return async ({ force, signal, ownerId }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    for (const characterId of await ctx.listCharacterIds(ownerId)) {
      if (signal.aborted) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential by design — parallel items would stampede the embed backend.
      const text = await ctx.loadCardText(characterId);
      if (text === undefined || text.length === 0) {
        skipped += 1;
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the read above).
      const result = await deps.store({
        kind: "card",
        lens: "card-text",
        characterId,
        content: text,
        model: ctx.roleClients.embedModel,
        dim: ctx.embedDim,
        force,
      });
      if (result.outcome === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
    }
    return { embedded, skipped };
  };
}
