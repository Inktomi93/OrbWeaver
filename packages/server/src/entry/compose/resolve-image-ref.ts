// `resolveImageUrl` op impl, extracted from the chat composition root so its gate is unit-testable in
// isolation. The asset resolves only when its owner is the turn host or a present participant of the
// referencing chat — never a bare hash→any-owner lookup across any shared chat.

import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export interface ImageRefAssets {
  readonly assetCasRefById: (
    id: AssetId,
  ) => Promise<{ readonly ownerId: UserId; readonly mime: string } | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

/** Resolve a parsed image ref to a model-fetchable URL/data-URI, or `null` when blocked/gone. An `external`
 *  ref is blocked when `forbidExternalMedia` is set (the load itself is a tracking-pixel/exfil vector).
 *  `isPresentParticipant(userId, chatId)` checks whether the asset's owner is a present member of the
 *  referencing chat. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  isPresentParticipant: (userId: UserId, chatId: ChatId) => Promise<boolean>,
  forbidExternalMedia: boolean,
  params: { readonly ownerId: UserId; readonly chatId: ChatId; readonly ref: ContentImageRef },
): Promise<string | null> {
  const { ownerId: hostId, chatId, ref } = params;
  if (ref.kind === "external") {
    return forbidExternalMedia ? null : ref.url;
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
  return `data:${meta.mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
