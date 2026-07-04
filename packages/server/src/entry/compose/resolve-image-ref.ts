// entry/compose/resolve-image-ref — the `resolveImageUrl` op impl (D45 asset→URL), extracted from the chat
// composition root so its GATE wiring is unit-testable in isolation.
//
// The canon `asset:<id>` ref carries the asset ROW ID, not the content hash. Resolve the `(owner, hash)`
// coordinates by id (un-principal — `assetCasRefById`), then GATE + read the mime through `getMetadata` with
// the REAL hash: its owner-scope + PD-28 co-participant fallback resolves a group member's own upload from
// THEIR CAS partition, and refuses a stranger's asset. Bytes then load by id (owner-blind — the row's own
// partition), so a member-owned image renders correctly. `null` ⇒ the engine drops that image part.

import type { Principal } from "@orb/contracts/identity";
import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The `AssetsService` slice `resolveImageRefToUrl` needs: the by-id coordinate lookup, the owner +
 *  co-participant metadata gate, and the by-id bytes read. `input.assets` satisfies this structurally. */
export interface ImageRefAssets {
  readonly assetCasRefById: (
    id: AssetId,
  ) => Promise<{ readonly ownerId: UserId; readonly hash: string } | undefined>;
  readonly getMetadata: (p: {
    readonly principal: Principal;
    readonly hash: string;
  }) => Promise<{ readonly mime: string } | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

/** Resolve a parsed D45 image ref to a model-fetchable URL/data-URI, or `null` when blocked/gone. `external`
 *  refs pass through (the `forbidExternalMedia` gate lives upstream). See the file header for the asset path. */
export async function resolveImageRefToUrl(
  assets: ImageRefAssets,
  resolveHostPrincipal: (userId: UserId) => Promise<Principal>,
  params: { readonly ownerId: UserId; readonly ref: ContentImageRef },
): Promise<string | null> {
  const { ownerId, ref } = params;
  if (ref.kind === "external") {
    return ref.url;
  }
  const assetId = castId<AssetId>(ref.assetId);
  const coords = await assets.assetCasRefById(assetId);
  if (!coords) {
    return null;
  }
  const meta = await assets.getMetadata({
    principal: await resolveHostPrincipal(ownerId),
    hash: coords.hash,
  });
  if (!meta) {
    return null;
  }
  const bytes = await assets.loadAssetBytes(assetId);
  if (!bytes) {
    return null;
  }
  return `data:${meta.mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
