// verb: assetCasRefById — resolve an asset's `(ownerId, hash, mime)` from its ROW ID alone. UN-PRINCIPAL by
// design (D20 — the `loadAssetBytes` posture): a pure row lookup that returns NO bytes and applies NO owner
// gate. Its one caller is the chat image-resolution seam (`resolveImageRefToUrl`), which gates the ref by
// OWNER — a chat-scoped REFERENCE-CHECK (is the owner a present participant of the referencing chat? — the
// D21 in-room shared-fiction scope, never a bare hash→owner oracle) — and builds the data-URI from `mime`.
// Compose-root-internal; never a user-facing surface. `undefined` when the row is gone.

import type { AssetId } from "@orb/kit/ids";
import type { AssetsContext } from "../context.ts";
import type { AssetCasRef } from "../contract/results.ts";
import type { AssetsService } from "../contract/service.ts";
import { loadAssetCasRefById } from "../persistence/queries.ts";

export function createAssetCasRefById(ctx: AssetsContext): AssetsService["assetCasRefById"] {
  return (assetId: AssetId): Promise<AssetCasRef | undefined> => loadAssetCasRefById(ctx.db, assetId);
}
