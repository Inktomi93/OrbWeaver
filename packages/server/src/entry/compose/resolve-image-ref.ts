// `resolveImageUrl` op impl, extracted from the chat composition root so its gate is unit-testable in
// isolation. The asset resolves only when its owner is the turn host or a present participant of the
// referencing chat — never a bare hash→any-owner lookup across any shared chat.
//
// #317: the answer carries the attachment's MEDIA KIND alongside the data URI — classified HERE, the one
// seam that holds the asset's stored mime AND its bytes: `video/*` → `video`; an ANIMATED `image/gif` →
// `video` (the owner's gif-as-motion rule — the model should see the frames, not a freeze); every other
// image → `image`. The animated check is kit's `isAnimated`, the SAME engine `assets.store` used to stamp
// the row's `animated` column — same truth, no second lookup, and it runs on bytes already in hand.

import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isAnimated } from "@orb/kit/image-sniff";
import type { ResolvedMediaRef } from "#domain/chat";

export interface ImageRefAssets {
  readonly assetCasRefById: (id: AssetId) => Promise<{ readonly ownerId: UserId; readonly mime: string } | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

const VIDEO_MIME_PREFIX = "video/";
const GIF_MIME = "image/gif";

/** The asset's chat-input media kind (#317) — see the header for the rule. */
function classifyMedia(mime: string, bytes: Uint8Array): ResolvedMediaRef["media"] {
  if (mime.startsWith(VIDEO_MIME_PREFIX)) {
    return "video";
  }
  return mime === GIF_MIME && isAnimated(bytes) ? "video" : "image";
}

/** Resolve a parsed media ref to a model-fetchable URL/data-URI + its media kind, or `null` when
 *  blocked/gone. An `external` ref is blocked when `forbidExternalMedia` is set (the load itself is a
 *  tracking-pixel/exfil vector) and classifies as `image` (the attachment machinery never mints external
 *  refs, so the arm is defensive). `isPresentParticipant(userId, chatId)` checks whether the asset's owner
 *  is a present member of the referencing chat. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  isPresentParticipant: (userId: UserId, chatId: ChatId) => Promise<boolean>,
  forbidExternalMedia: boolean,
  params: { readonly ownerId: UserId; readonly chatId: ChatId; readonly ref: ContentImageRef },
): Promise<ResolvedMediaRef | null> {
  const { ownerId: hostId, chatId, ref } = params;
  if (ref.kind === "external") {
    return forbidExternalMedia ? null : { url: ref.url, media: "image" };
  }
  const assetId = castId<AssetId>(ref.assetId);
  const meta = await assets.assetCasRefById(assetId);
  if (!meta) {
    return null;
  }
  const authorized = meta.ownerId === hostId || (await isPresentParticipant(meta.ownerId, chatId));
  if (!authorized) {
    return null;
  }
  const bytes = await assets.loadAssetBytes(assetId);
  if (!bytes) {
    return null;
  }
  return {
    url: `data:${meta.mime};base64,${Buffer.from(bytes).toString("base64")}`,
    media: classifyMedia(meta.mime, bytes),
  };
}
