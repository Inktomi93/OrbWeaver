// entry/compose/resolve-image-ref — the `resolveImageUrl` op impl (D45 asset→URL), extracted from the chat
// composition root so its gate is unit-testable in isolation.
//
// D21 REFERENCE-CHECK (not a hash→owner oracle — that breadth is PD-107). The canon `asset:<id>` ref carries
// the asset ROW ID and is read from `chatId`'s own canon by construction. Resolve `(ownerId, mime)` by id
// (un-principal), then gate by OWNER: the asset resolves only when its owner is the turn HOST or a PRESENT
// participant of `chatId` — the in-room shared-fiction scope (a group member's own upload renders from THEIR
// CAS partition; a stranger's asset, even if its id is somehow referenced, never does). Bytes load by id
// (owner-blind). `null` ⇒ the engine drops that image part. NO `loadCoParticipantOwner` / no cross-chat
// existence oracle — the gate is scoped to the referencing chat.

import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The `AssetsService` slice `resolveImageRefToUrl` needs: the by-id `(ownerId, mime)` lookup + the by-id
 *  bytes read. `input.assets` (whose `assetCasRefById` also returns `hash`) satisfies this structurally. */
export interface ImageRefAssets {
  readonly assetCasRefById: (
    id: AssetId,
  ) => Promise<{ readonly ownerId: UserId; readonly mime: string } | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

/** Resolve a parsed D45 image ref to a model-fetchable URL/data-URI, or `null` when blocked/gone. `external`
 *  refs pass through (the `forbidExternalMedia` gate lives upstream). `isPresentParticipant(userId, chatId)`
 *  is the D21 reference-check: is the asset's owner a present member of the referencing chat? */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  isPresentParticipant: (userId: UserId, chatId: ChatId) => Promise<boolean>,
  params: { readonly ownerId: UserId; readonly chatId: ChatId; readonly ref: ContentImageRef },
): Promise<string | null> {
  const { ownerId: hostId, chatId, ref } = params;
  if (ref.kind === "external") {
    return ref.url;
  }
  const assetId = castId<AssetId>(ref.assetId);
  const meta = await assets.assetCasRefById(assetId);
  if (!meta) {
    return null;
  }
  // The ref is in THIS chat's canon by construction; resolve it only if its owner is the host or a present
  // participant of the room (never a bare hash→any-owner lookup across any shared chat — D21 / PD-107).
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
