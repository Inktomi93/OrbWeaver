// domain/embeddings/indexer/handlers — the event-driven re-embed handlers. The async/bulk path: a save in a
// DIFFERENT feature (`character` / `assets`) emits a domain event; the indexer re-reads CANON by the event's
// branded id (never trusting event-carried data — @orb/contracts/events) and dispatches to the ONE write
// path (`store`). (`memory` does NOT go through here — it calls `store` directly post-turn for its
// digest/segment lenses; the indexer is only for writes triggered by a save in a different feature.)
//
// Each handler skips silently when the source is gone (deleted between the emit and the handler) — a missing
// card/asset is not an error, just nothing to embed. The `(model, dim)` space tag comes from the injected
// bundle: the model from `roleClients.embedModel` / `imageEmbedModel` (role-clients: stored on the row's
// model column), the dim from the declared active space (`ctx.embedDim` / `ctx.imageEmbedDim`).

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import { getLog } from "#foundation/observability";
import type { EmbeddingsIndexerContext } from "../contract/service";
import { generateAvatarCaption } from "./caption";

/** `character.updated` → re-embed the card text (`store(kind='card', lens='card-text')`). Idempotent: the
 *  store verb hash-gates, so a no-op edit is a cheap noop (no re-embed). */
export async function onCharacterUpdated(
  ctx: EmbeddingsIndexerContext,
  event: CharacterUpdatedEvent,
): Promise<void> {
  // `character.updated` fires on EVERY card write — including identity-flag edits (star/archive/theme,
  // card-merge.ts) that change no embeddable content. The emit site (`character/verbs/update.ts`) already knows
  // which it is, so it stamps `contentChanged`; a flag-only edit skips ENTIRELY here — zero canon read, zero
  // store, zero model touch. This is the owner ruling ("starring shouldn't trigger embedding", first-time
  // included): backfill of a never-embedded card belongs to content events + import + the PD-53 sweep, never to
  // a star toggle. (The store's own content-hash gate remains the second belt for a same-content re-fire.)
  if (!event.contentChanged) {
    getLog().debug(
      { characterId: event.characterId },
      "embeddings indexer: flag-only edit (no content change) — skipped",
    );
    return;
  }
  const text = await ctx.loadCardText(event.characterId);
  if (text === undefined) {
    return;
  }
  const result = await ctx.store({
    kind: "card",
    lens: "card-text",
    characterId: event.characterId,
    content: text,
    model: ctx.roleClients.embedModel,
    dim: ctx.embedDim,
  });
  // A content edit whose projected embed text is nonetheless unchanged (or a duplicate delivery) short-circuits
  // in the store to `noop`; surface it at debug so an absent embed is explainable.
  if (result.outcome === "noop") {
    getLog().debug(
      { characterId: event.characterId },
      "embeddings indexer: card text unchanged — re-embed skipped",
    );
  }
}

/** `asset.created` → embed BOTH avatar lenses: `image-raw` (pure visual signal) then `image-captioned` (image
 *  bytes + the inline-generated caption, joint VL). Both share the bytes' content_hash, so a re-index dedups.
 *  Delivery is in-process fire-and-forget for v1 (RESOLVED PD-27; the PD-53 catch-up sweeps are the
 *  reliability backstop); this handler stays delivery-mechanism-agnostic — it is idempotent (hash-gated
 *  store), so a duplicate delivery is a cheap noop. */
export async function onAssetCreated(
  ctx: EmbeddingsIndexerContext,
  event: AssetCreatedEvent,
): Promise<void> {
  const bytes = await ctx.loadAssetBytes(event.assetId);
  if (bytes === undefined) {
    return;
  }
  const model = ctx.roleClients.imageEmbedModel;
  await ctx.store({
    kind: "avatar",
    lens: "image-raw",
    assetId: event.assetId,
    content: bytes,
    model,
    dim: ctx.imageEmbedDim,
  });
  const caption = await generateAvatarCaption(ctx.roleClients, bytes);
  await ctx.store({
    kind: "avatar",
    lens: "image-captioned",
    assetId: event.assetId,
    content: bytes,
    caption,
    captionMeta: { model: ctx.roleClients.summarizerModel },
    model,
    dim: ctx.imageEmbedDim,
  });
}
