// verb: resolveOwnedAssetRefs (#67) — resolve the `(assetId, hash)` pairs the OWNER owns among a requested
// id set. TWO trusted callers share this ONE owner-scoped read:
//   • the inline-image RENDER resolver (tRPC `assets.resolveBlobRefs`): a message body carries `asset:<id>`
//     refs (D51), but the blob route is keyed by HASH (D21), so the client resolves id → hash to build
//     `blobUrl`. The router passes the SESSION owner's id (never a user-supplied owner).
//   • the send-verb ATTACH trust boundary (chat's injected op): the owned subset IS the ownership proof — a
//     requested id absent from the result is not the actor's, so the attach is rejected (no cross-user asset).
//
// OWNER-SCOPED by explicit `ownerId` (the `listImageAssetIds`/D20 shape takes the owner as a param rather than
// a `principal`, because the second caller is server-internal chat, which holds `principal.userId` not a full
// principal, and the tRPC caller derives the owner from the authenticated session). The `ownerId` predicate is
// in the WHERE, so a foreign / gone id is simply absent — never a leak, never a hash oracle for another owner.

import type { AssetId, UserId } from "@orb/kit/ids";
import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import type { AssetBlobRef } from "../contract/views";
import { selectOwnedAssetRefs } from "../persistence/queries";

export function createResolveOwnedAssetRefs(ctx: AssetsContext): AssetsService["resolveOwnedAssetRefs"] {
  return (ownerId: UserId, assetIds: readonly AssetId[]): Promise<readonly AssetBlobRef[]> => selectOwnedAssetRefs(ctx.db, ownerId, assetIds);
}
