// domain/embeddings/indexer/handlers — the event-driven re-embed handlers. The async/bulk path: a save in a
// DIFFERENT feature (`character` / `assets`) emits a domain event; the indexer re-reads CANON by the event's
// branded id (never trusting event-carried data — @orb/contracts/events) and dispatches to the ONE write
// path (`store`). (`memory` does NOT go through here — it calls `store` directly post-turn for its
// digest/segment lenses; embeddings.md §"Named subsystem: indexer".)
//
// Each handler skips silently when the source is gone (deleted between the emit and the handler) — a missing
// card/asset is not an error, just nothing to embed. The `(model, dim)` space tag comes from the injected
// bundle: the model from `roleClients.embedModel` / `imageEmbedModel` (role-clients: stored on the row's
// model column), the dim from the declared active space (`ctx.embedDim` / `ctx.imageEmbedDim`).

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import type { EmbeddingsIndexerContext } from "../contract/service";

// The avatar caption prompt (image-captioned lens): the joint VL embed combines the image bytes with this
// generated caption. A constant (no magic strings) — the caption model is `roleClients.summarizerModel`.
const CAPTION_SYSTEM_PROMPT =
  "You are an image captioner. Describe the visible subject, style, and notable details in one concise sentence. No preamble.";
const CAPTION_USER_PROMPT = "Describe this image.";

/** Generate the avatar caption inline via the injected `summarize` op (embeddings.md open decision: inline,
 *  not a chained `caption.created` event). Returns the summary text (empty string when the family returned
 *  no item — the joint embed still runs on the image bytes). */
async function generateCaption(ctx: EmbeddingsIndexerContext, bytes: Uint8Array): Promise<string> {
  const result = await ctx.roleClients.summarize([
    { systemPrompt: CAPTION_SYSTEM_PROMPT, userPrompt: CAPTION_USER_PROMPT, images: [bytes] },
  ]);
  return result.items[0]?.text ?? "";
}

/** `character.updated` → re-embed the card text (`store(kind='card', lens='card-text')`). Idempotent: the
 *  store verb hash-gates, so a no-op edit is a cheap noop (no re-embed). */
export async function onCharacterUpdated(
  ctx: EmbeddingsIndexerContext,
  event: CharacterUpdatedEvent,
): Promise<void> {
  const text = await ctx.loadCardText(event.characterId);
  if (text === undefined) {
    return;
  }
  await ctx.store({
    kind: "card",
    lens: "card-text",
    characterId: event.characterId,
    content: text,
    model: ctx.roleClients.embedModel,
    dim: ctx.embedDim,
  });
}

/** `asset.created` → embed BOTH avatar lenses: `image-raw` (pure visual signal) then `image-captioned` (image
 *  bytes + the inline-generated caption, joint VL). Both share the bytes' content_hash, so a re-index dedups.
 *  FLAG(PD-27): at-least-once delivery (in-process fire-and-forget vs an outbox) is the joint
 *  assets↔embeddings decision the orchestrator owns; this handler is delivery-mechanism-agnostic — it is
 *  idempotent (hash-gated store), so a duplicate delivery is a cheap noop. */
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
  const caption = await generateCaption(ctx, bytes);
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
