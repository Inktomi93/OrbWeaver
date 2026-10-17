// Stored media authorization precedes byte reads and deferred quality conversion.
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { ImageRefAssets, ResolveMediaRef, ResolveMediaRefDeps } from "../contract/media-ref.ts";
import type { ResolvedMediaRef } from "../contract/results.ts";
import { isPresentParticipant } from "../persistence/participants-read.ts";

const VIDEO_MIME_PREFIX = "video/";
const GIF_MIME = "image/gif";

export function createResolveMediaRef(input: DbAssemblyInput<ResolveMediaRefDeps>): ResolveMediaRef {
  const deps: ResolveMediaRefDeps = { ...input, db: databaseForOwner(input.db) };
  return (params) =>
    resolveImageRefToUrl(
      { ...deps.assets, ...deps.mediaProcessing },
      (userId, chatId) => isPresentParticipant(deps.db, chatId, userId),
      deps.forbidExternalMedia(),
      params,
    );
}

/** Resolve a parsed media ref to its kind and ready/deferred URL, or `null` when
 *  blocked/gone. An `external` ref is blocked when `forbidExternalMedia` is set (the load itself is a
 *  tracking-pixel/exfil vector) and classifies as `image` (the attachment machinery never mints external
 *  refs, so the arm is defensive). `isPresentParticipant(userId, chatId)` checks whether the asset's owner
 *  is a present member of the referencing chat. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  ownerIsPresent: (userId: UserId, chatId: ChatId) => Promise<boolean>,
  forbidExternalMedia: boolean,
  params: Parameters<ResolveMediaRef>[0],
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
  const authorized = meta.ownerId === hostId || (await ownerIsPresent(meta.ownerId, chatId));
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
