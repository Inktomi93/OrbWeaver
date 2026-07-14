// verb: embedCorpus — bulk text catch-up sweep, driven by the embed-corpus workload. Enumerates characters
// and routes each through the one write path (store). Resumable via store's content_hash short-circuit
// (force bypasses it); cooperative abort between items, every completed item durable + idempotent; an embed
// failure propagates so the rerun resumes.
//
// PD-104 — this is the REINDEX half of purge+reindex. After a full BULK sweep re-embeds every card into the
// box's active `(model, dim)` space, it PURGES `character_embeddings` rows left in any OTHER space (an
// old-model change strands them; the uniform `(characterId, model)` upsert key means the new space was
// written additively beside the old, never overwriting it). Purge is BULK-ONLY (ownerId === null): a model
// change is a box-level event, so a singular per-owner catch-up must not delete the global old space. On an
// abort the purge is skipped — the space stays a strict superset (never a gap); the rerun reclaims it.

import type { EmbeddingsContext } from "../context";
import type { EmbedPassParams } from "../contract/params";
import type { BulkEmbedResult } from "../contract/results";
import type { EmbeddingsService } from "../contract/service";
import { purgeStaleVectors } from "../persistence/clear";

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
    // PD-104 purge (reclaim the old space) — only after a complete bulk sweep, never on abort or a
    // singular per-owner pass. A no-op unless the box embed model changed since the last index.
    if (ownerId === null && !signal.aborted) {
      await purgeStaleVectors(ctx.db, "character_embeddings", ctx.roleClients.embedModel);
    }
    return { embedded, skipped };
  };
}
