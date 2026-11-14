// The chat-scoped render resolver assets consumes (`AssetsContext.loadChatAssetRefs`): a pair is returned only
// when the asset has a `message_assets` row for a message in the room at or above the caller's history floor, the
// caller is a present member, and the owner is in the room's consent set (present and enabled). Membership alone is
// not sufficient; the `message_assets` FK is the reference. Chat reads its own tables first and asks assets only for
// the rows of the assets it found linked there.

import type { AssetBlobRef, LoadChatAssetRefsOp } from "@orb/contracts/assets";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { RoomArtReads } from "../contract/room-art-reads.ts";
import { loadVisibleAssetLinksInRoom } from "../persistence/co-participant-assets.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { keepConsentingOwners } from "../substrate/participants-humans.ts";

type Ctx = Pick<ChatContext, "db" | "resolveUserEnabled"> & Pick<RoomArtReads, "loadAssetRefHolders">;

export function createLoadChatAssetRefs(input: DbAssemblyInput<Ctx>): LoadChatAssetRefsOp {
  const ctx: Ctx = { ...input, db: databaseForOwner(input.db) };
  return async (callerId, forChatId, assetIds) => {
    if (assetIds.length === 0) {
      return [];
    }
    const links = await loadVisibleAssetLinksInRoom(ctx.db, callerId, forChatId, assetIds);
    if (links.length === 0) {
      return [];
    }
    const holders = await ctx.loadAssetRefHolders([...new Set(links.map((link) => link.assetId))]);
    const ownerSeats = new Map((await loadParticipants(ctx.db, forChatId)).flatMap((seat) => (seat.userId === null ? [] : [[seat.userId, seat] as const])));
    const candidates = links.flatMap((link) => {
      const holder = holders.get(link.assetId);
      const ownerSeat = holder === undefined ? undefined : ownerSeats.get(holder.ownerId);
      return holder === undefined || ownerSeat === undefined ? [] : [{ chatId: link.chatId, ownerId: holder.ownerId, ownerSeat, ref: holder.ref }];
    });
    const consented = await keepConsentingOwners(ctx, candidates);
    // One ref per asset: an asset placed on several visible messages yields one row per link.
    const refs = new Map<AssetId, AssetBlobRef>(consented.map((row) => [row.ref.assetId, row.ref]));
    return [...refs.values()];
  };
}
