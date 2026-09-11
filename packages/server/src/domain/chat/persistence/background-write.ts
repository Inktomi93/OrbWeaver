import type { ChatMetadata } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, sql } from "drizzle-orm";

function backgroundAssetId(metadata: ChatMetadata | null): AssetId | undefined {
  const source = metadata?.background;
  return source?.kind === "asset" && source.assetId.length > 0 ? castId<AssetId>(source.assetId) : undefined;
}

/** Keeps a carried JSON asset reference and the asset row in one SQLite write-serialization decision. */
export function guardedChatId(db: Db, chatId: ChatId, metadata: ChatMetadata | null): ChatId | ReturnType<typeof sql<ChatId>> {
  const assetId = backgroundAssetId(metadata);
  if (assetId === undefined) {
    return chatId;
  }
  return sql<ChatId>`(SELECT ${chatId} WHERE ${carriedBackgroundAvailable(db, metadata)})`;
}

/** Existing room metadata may carry a background across owners, but never across deletion of its asset. */
// @orb-waive owner-scoped-reads(assets): the authorized source room or import operation supplied this carried asset id, and carried room backgrounds intentionally remain valid across owners. This ends if carried backgrounds become owner-only or move to a normalized FK-backed relation.
export function carriedBackgroundAvailable(db: Db, metadata: ChatMetadata | null): SQL {
  const assetId = backgroundAssetId(metadata);
  if (assetId === undefined) {
    return sql`1`;
  }
  return exists(db.select({ one: sql`1` }).from(assets).where(eq(assets.id, assetId)));
}

/** Direct room customization additionally preserves the caller-owned asset authority gate. */
export function ownedBackgroundAvailable(db: Db, ownerId: UserId, metadata: ChatMetadata | null): SQL {
  const assetId = backgroundAssetId(metadata);
  if (assetId === undefined) {
    return sql`1`;
  }
  return exists(
    db
      .select({ one: sql`1` })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId))),
  );
}

export function carriesAssetBackground(metadata: ChatMetadata | null): boolean {
  return backgroundAssetId(metadata) !== undefined;
}
