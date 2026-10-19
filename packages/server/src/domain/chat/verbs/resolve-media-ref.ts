// Stored media authorization precedes byte reads and deferred quality conversion.
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { ImageRefAssets, MediaRoomAccess, ResolveMediaRef, ResolveMediaRefDeps } from "../contract/media-ref.ts";
import type { ResolvedMediaRef } from "../contract/results.ts";
import { isPresentParticipant } from "../persistence/participants-read.ts";
import { hasMessageAssetLinkInChat } from "../persistence/queries.ts";

const VIDEO_MIME_PREFIX = "video/";
const GIF_MIME = "image/gif";

export function createResolveMediaRef(input: DbAssemblyInput<ResolveMediaRefDeps>): ResolveMediaRef {
  const deps: ResolveMediaRefDeps = { ...input, db: databaseForOwner(input.db) };
  const room: MediaRoomAccess = {
    ownerIsPresent: (userId, chatId) => isPresentParticipant(deps.db, chatId, userId),
    isPlacedInRoom: (assetId, chatId) => hasMessageAssetLinkInChat(deps.db, chatId, assetId),
  };
  return (params) => resolveImageRefToUrl({ ...deps.assets, ...deps.mediaProcessing }, room, deps.forbidExternalMedia(), params);
}

/** Resolve a parsed media ref to its kind and ready/deferred URL, or `null` when blocked/gone. An `external` ref
 *  is blocked when `forbidExternalMedia` is set (the load itself is a tracking-pixel/exfil vector) and classifies
 *  as `image` (the attachment machinery never mints external refs, so the arm is defensive).
 *
 *  A stored asset needs BOTH room facts. Its owner is the host or a present member, and the room placed it
 *  ({@link MediaRoomAccess.isPlacedInRoom}). Presence alone would let any member's quote of an id read off a
 *  transcript send another member's picture to the model. The row's author is no proof either: the history
 *  squash folds adjacent user rows under the first row's slot id, and a host may edit a member's row. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  room: MediaRoomAccess,
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
  const ownerAdmitted = meta.ownerId === hostId || (await room.ownerIsPresent(meta.ownerId, chatId));
  if (!(ownerAdmitted && (await room.isPlacedInRoom(assetId, chatId)))) {
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
