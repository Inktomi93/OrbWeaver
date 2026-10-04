// The event-driven re-embed handlers: a save in a different feature emits a domain event; the indexer
// re-reads canon by the event's branded id (never trusting event-carried data) and dispatches to the one
// write path (`store`). Each handler skips silently when the source is gone.

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import { getLog } from "#foundation/observability";
import type { EmbeddingsIndexerContext } from "../contract/service.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

/** `character.updated` → re-embed the card text (`store(kind='card', lens='card-text')`). Idempotent: the
 *  store verb hash-gates, so a no-op edit is a cheap noop (no re-embed). */
export async function onCharacterUpdated(ctx: EmbeddingsIndexerContext, event: CharacterUpdatedEvent): Promise<void> {
  // `character.updated` fires on every card write, including identity-flag edits (star/archive/theme) that
  // change no embeddable content. The emit site stamps `contentChanged`; a flag-only edit skips entirely
  // here — zero canon read, zero store, zero model touch.
  if (!event.contentChanged) {
    getLog().debug({ characterId: event.characterId }, "embeddings indexer: flag-only edit (no content change) — skipped");
    return;
  }
  const text = await ctx.loadCardText(event.characterId);
  if (text === undefined) {
    return;
  }
  const ownerId = await ctx.loadCharacterOwner(event.characterId);
  if (ownerId === null) {
    return;
  }
  const embedModel = await requireTaskModel(ctx, ownerId, "embed");
  if (embedModel === null) {
    getLog().debug({ characterId: event.characterId, ownerId }, "embeddings indexer: the owner has no embed connection — skipped");
    return;
  }
  const result = await ctx.store({
    kind: "card",
    lens: "card-text",
    ownerId,
    characterId: event.characterId,
    content: text,
    model: embedModel,
  });
  // A content edit whose projected embed text is nonetheless unchanged short-circuits to `noop`; surface it
  // at debug so an absent embed is explainable.
  if (result.outcome === "noop") {
    getLog().debug({ characterId: event.characterId }, "embeddings indexer: card text unchanged — re-embed skipped");
  }
}

/** An asset event uses the same preparation and in-flight work as the catch-up sweep. */
export async function onAssetCreated(ctx: EmbeddingsIndexerContext, event: AssetCreatedEvent): Promise<void> {
  await ctx.indexAsset(event.assetId);
}
