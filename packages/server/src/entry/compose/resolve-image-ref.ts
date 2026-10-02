// `resolveImageUrl` op impl, extracted from the chat composition root so its gate is unit-testable in
// isolation. The asset resolves only when its owner is the turn host or a present participant of the
// referencing chat — never a bare hash→any-owner lookup across any shared chat.
//
// Quality processing happens only after authorization and never modifies the stored asset.

import type { AttachmentQuality } from "@orb/contracts/inference";
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { ResolvedMediaRef } from "#domain/chat";
import type { ImageAdapter } from "#infra/image";
import type { prepareVideo } from "#infra/media";

export interface ImageRefAssets {
  readonly frameCount: ImageAdapter["frameCount"];
  readonly prepareVideo: typeof prepareVideo;
  readonly assetCasRefById: (id: AssetId) => Promise<{ readonly ownerId: UserId; readonly mime: string } | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

const VIDEO_MIME_PREFIX = "video/";
const GIF_MIME = "image/gif";

/** Resolve a parsed media ref to its kind and ready/deferred URL, or `null` when
 *  blocked/gone. An `external` ref is blocked when `forbidExternalMedia` is set (the load itself is a
 *  tracking-pixel/exfil vector) and classifies as `image` (the attachment machinery never mints external
 *  refs, so the arm is defensive). `isPresentParticipant(userId, chatId)` checks whether the asset's owner
 *  is a present member of the referencing chat. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  isPresentParticipant: (userId: UserId, chatId: ChatId) => Promise<boolean>,
  forbidExternalMedia: boolean,
  params: {
    readonly ownerId: UserId;
    readonly chatId: ChatId;
    readonly ref: ContentImageRef;
    readonly quality?: AttachmentQuality | undefined;
    readonly signal?: AbortSignal | undefined;
  },
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
  const mime = meta.mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const motion = await isMotion(assets, mime, bytes);
  const quality = params.quality ?? DEFAULT_ATTACHMENT_QUALITY;
  if (motion) {
    return {
      media: "video",
      url: async (): Promise<string> => {
        const outbound = await assets.prepareVideo(bytes, mime, quality.videoMaxResolution, { signal: params.signal });
        const outboundMime = mime === GIF_MIME || quality.videoMaxResolution !== "original" ? "video/mp4" : meta.mime;
        return `data:${outboundMime};base64,${Buffer.from(outbound).toString("base64")}`;
      },
    };
  }
  return { url: `data:${meta.mime};base64,${Buffer.from(bytes).toString("base64")}`, media: "image" };
}

async function isMotion(assets: ImageRefAssets, mime: string, bytes: Uint8Array): Promise<boolean> {
  if (mime.startsWith(VIDEO_MIME_PREFIX)) {
    return true;
  }
  return mime === GIF_MIME && sniffMime(bytes) === GIF_MIME && (await assets.frameCount(bytes)) > 1;
}
