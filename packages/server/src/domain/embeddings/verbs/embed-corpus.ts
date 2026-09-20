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

import type { CharacterId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
import type { BulkEmbedResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

/** One card's sweep step: no text or no owner/embed binding ⇒ skipped (a card whose owner has no `embed`
 *  connection is not embedded in anyone else's space — vector tasks are owner-scoped, §7.5). */
async function embedOneCard(
  ctx: EmbeddingsContext,
  deps: { readonly store: EmbeddingsService["store"] },
  characterId: CharacterId,
  force: boolean | undefined,
): Promise<"written" | "skipped"> {
  const text = await ctx.loadCardText(characterId);
  if (text === undefined || text.length === 0) {
    return "skipped";
  }
  const cardOwnerId = await ctx.loadCharacterOwner(characterId);
  const embedModel = cardOwnerId === null ? null : await requireTaskModel(ctx, cardOwnerId, "embed");
  if (cardOwnerId === null || embedModel === null) {
    return "skipped";
  }
  const result = await deps.store({
    kind: "card",
    lens: "card-text",
    ownerId: cardOwnerId,
    characterId,
    content: text,
    model: embedModel,
    dim: ctx.embedDim,
    force,
  });
  return result.outcome === "written" ? "written" : "skipped";
}

export function createEmbedCorpus(ctx: EmbeddingsContext, deps: { readonly store: EmbeddingsService["store"] }): EmbeddingsService["embedCorpus"] {
  return async ({ force, signal, ownerId }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    for (const characterId of await ctx.listCharacterIds(ownerId)) {
      if (signal.aborted) {
        break;
      }
      if ((await embedOneCard(ctx, deps, characterId, force)) === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
    }
    // PD-104 purge (reclaim the old space) — only after a complete bulk sweep, never on abort or a
    // singular per-owner pass. A no-op unless the box embed model changed since the last index.
    // PD-104 purge — the WORKLOAD principal's space is the reference (step 8 owes the per-owner join; until
    // then a whole-corpus sweep purges against the caller's own embed model, stated in §15c).
    const purgeModel = ownerId === null ? null : await requireTaskModel(ctx, ownerId, "embed");
    if (purgeModel !== null && !signal.aborted) {
      await purgeStaleVectors(ctx.db, "character_embeddings", purgeModel);
    }
    return { embedded, skipped };
  };
}
