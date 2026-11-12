// The chat-scoped render resolver assets consumes (`AssetsContext.loadChatAssetRefs`): a pair is returned only
// when the asset has a `message_assets` row for a message in the room at or above the caller's history floor, the
// caller is a present member, and the owner is in the room's consent set (present and enabled). Membership alone is
// not sufficient; the `message_assets` FK is the reference.

import type { AssetBlobRef, LoadChatAssetRefsOp } from "@orb/contracts/assets";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import { loadChatAssetRefRows } from "../persistence/co-participant-assets.ts";
import { keepConsentingOwners } from "../substrate/participants-humans.ts";

type Ctx = Pick<ChatContext, "db" | "resolveUserEnabled">;

export function createLoadChatAssetRefs(input: DbAssemblyInput<Ctx>): LoadChatAssetRefsOp {
  const ctx: Ctx = { ...input, db: databaseForOwner(input.db) };
  return async (callerId, forChatId, assetIds) => {
    if (assetIds.length === 0) {
      return [];
    }
    const consented = await keepConsentingOwners(ctx, await loadChatAssetRefRows(ctx.db, callerId, forChatId, assetIds));
    // One ref per asset: an asset placed on several visible messages yields one row per link.
    const refs = new Map<AssetId, AssetBlobRef>(consented.map((row) => [row.ref.assetId, row.ref]));
    return [...refs.values()];
  };
}
