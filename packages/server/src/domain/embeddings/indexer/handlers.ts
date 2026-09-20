// The event-driven re-embed handlers: a save in a different feature emits a domain event; the indexer
// re-reads canon by the event's branded id (never trusting event-carried data) and dispatches to the one
// write path (`store`). Each handler skips silently when the source is gone.

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import { getLog } from "#foundation/observability";
import type { EmbeddingsIndexerContext } from "../contract/service.ts";
import { existingImageSkip, insertImageSkip } from "../persistence/queries.ts";
import { imageBelowFloor } from "../substrate/image-admission.ts";
import { reportImageSpaceDegrade } from "../substrate/image-space-degrade.ts";
import { requireTaskModel, resolveImageSpace } from "../substrate/task-model.ts";
import { analyzeAvatarImage } from "./caption.ts";

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
    dim: ctx.embedDim,
  });
  // A content edit whose projected embed text is nonetheless unchanged short-circuits to `noop`; surface it
  // at debug so an absent embed is explainable.
  if (result.outcome === "noop") {
    getLog().debug({ characterId: event.characterId }, "embeddings indexer: card text unchanged — re-embed skipped");
  }
}

/** `asset.created` → embed both avatar lenses: `image-raw` then `image-captioned`. Both share the bytes'
 *  content_hash, so a re-index dedups. Idempotent — a duplicate delivery is a cheap noop. */
export async function onAssetCreated(ctx: EmbeddingsIndexerContext, event: AssetCreatedEvent): Promise<void> {
  // EMBEDDABILITY GATE (keyed on the stored MIME, never on AssetKind): `asset.created` fires for EVERY
  // content-addressed asset, but the `imageEmbed` role only speaks images. A non-image asset — a `video/*`
  // background (BG-V), a document — must never reach the image-embed path; before this gate its bytes were
  // fed to the model and failed, logged-and-swallowed by the bus's error isolation (wasted decode + spend).
  // The MIME is the magic-verified upload mime, so it is authoritative; reading it FIRST also means a large
  // video blob is never loaded just to be skipped. This mirrors the bulk sweep's `mime LIKE 'image/%'`
  // filter (`assets/verbs/list-image-asset-ids`) — the axis is embeddability, and background-KIND *images*
  // keep embedding exactly as before.
  const mime = await ctx.loadAssetMime(event.assetId);
  if (mime === null || !mime.startsWith("image/")) {
    getLog().debug({ assetId: event.assetId, mime }, "embeddings indexer: non-image asset — not image-embeddable, skipped");
    return;
  }
  // ADMISSION FLOOR (recorded skip, read FIRST): a duplicate delivery of an asset already refused by the
  // dimension floor is honored here — no byte load, no caption, no embed. The record is what makes the skip
  // idempotent (content_hash self-heal would otherwise re-attempt a silently-skipped asset every pass).
  if (await existingImageSkip(ctx.db, event.assetId)) {
    getLog().debug({ assetId: event.assetId }, "embeddings indexer: asset previously skipped by the admission floor — honored, not re-attempted");
    return;
  }
  const bytes = await ctx.loadAssetBytes(event.assetId);
  if (bytes === undefined) {
    return;
  }
  // ADMISSION FLOOR (dimension gate): a degenerate asset (a 1×1 tracking-pixel / placeholder) carries no
  // visual signal — captioning + embedding it burns VL/embed compute and writes a degenerate vector into the
  // retrieval + discovery substrate. Record the refusal (visible + idempotent) and skip BEFORE any spend.
  const admission = imageBelowFloor(bytes);
  if (admission.belowFloor) {
    await insertImageSkip(ctx.db, {
      assetId: event.assetId,
      reason: "below-dimension-floor",
      width: admission.width,
      height: admission.height,
      now: ctx.now(),
    });
    getLog().debug(
      { assetId: event.assetId, width: admission.width, height: admission.height },
      "embeddings indexer: asset below the dimension floor — caption+embed skipped, skip recorded",
    );
    return;
  }
  const ownerId = await ctx.loadAssetOwner(event.assetId);
  if (ownerId === null) {
    return;
  }
  // THE JOINT-SPACE RULE (§10-3). Before it, an owner with no `imageEmbed` binding lost the asset here to a
  // debug line: the picture was never searchable and nothing at any readable level said so. Now the space
  // resolver answers with the arm that IS available — the joint image lens, or the captioned-TEXT fallback
  // in the owner's `embed` space — and only a total absence of any vector connection is a skip.
  const space = await resolveImageSpace(ctx, ownerId);
  if (space === null) {
    getLog().warn(
      { assetId: event.assetId, ownerId },
      "embeddings indexer: this owner has NO vector connection at all (neither imageEmbed nor embed) - the image cannot be indexed and will not be searchable until one is bound",
    );
    return;
  }
  if (space.via === "embed") {
    reportImageSpaceDegrade(ownerId, space.model, space.degraded);
  } else {
    // Pixels only reach a vector through an image embedder, so the raw lens exists in the joint arm alone.
    await ctx.store({
      kind: "avatar",
      lens: "image-raw",
      ownerId,
      assetId: event.assetId,
      content: bytes,
      model: space.model,
      dim: ctx.imageEmbedDim,
    });
  }
  // ONE vision call yields the caption AND the grammar-enforced facet breakdown (issue #164) — the row is
  // born analysed, so the catch-up sweep never has to revisit it. It rides the SUMMARIZE role, so it is
  // available in BOTH arms: the fallback's whole premise is that the caption is the signal that survives.
  const analysis = await analyzeAvatarImage(await ctx.roleClientsFor(ownerId), bytes);
  await ctx.store({
    kind: "avatar",
    lens: "image-captioned",
    ownerId,
    assetId: event.assetId,
    content: bytes,
    caption: analysis.caption,
    captionMeta: analysis.captionMeta,
    via: space.via,
    model: space.model,
    dim: ctx.imageEmbedDim,
  });
}
