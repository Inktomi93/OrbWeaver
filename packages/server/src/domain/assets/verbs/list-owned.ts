// verb: listOwned — gallery v1 (§1.2). The caller's own assets, newest-first, keyset-paged. Owner-scoped
// off `principal.userId` (§7.1 — never a `users` read); optional `kind` filter. Returns a plain
// `AssetListItem[]` (no page envelope): the client derives the next cursor from the last row's
// `(uploadedAt, assetId)`, and a short page is end-of-list. Each row carries the stored `animated` fact (G2).

import type { AssetsContext } from "../context";
import type { ListOwnedParams } from "../contract/params";
import type { AssetsService } from "../contract/service";
import type { AssetListItem } from "../contract/views";
import { listOwnedAssetRows } from "../persistence/queries";

export function createListOwned(ctx: AssetsContext): AssetsService["listOwned"] {
  return ({
    principal,
    kind,
    limit,
    cursor,
    cursorId,
  }: ListOwnedParams): Promise<AssetListItem[]> =>
    listOwnedAssetRows(ctx.db, { ownerId: principal.userId, kind, limit, cursor, cursorId });
}
