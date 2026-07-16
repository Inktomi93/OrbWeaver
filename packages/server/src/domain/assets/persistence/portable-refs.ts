// persistence/portable-refs — the owner-scoped reads that drive the assets-portability export.
// selectOwnedReferencedAssetIds walks the ASSET_REFS registry (the FK side, owner-scoped via the assets
// join); selectInlineReferencedContents reads the chat-canon asset:<id> refs the FK registry can't see
// (membership-scoped, LIKE-prefiltered); loadOwnedAssetForExport is the export's owner gate — a foreign or
// missing id resolves to undefined, never exported.

import type { AssetKind } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets, chatParticipants, messages, messageVariants } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, like } from "drizzle-orm";
import { ASSET_REFS } from "./asset-refs";

const LIMIT_ONE = 1;
const INLINE_REF_LIKE = "%asset:%";

interface OwnedAssetExportRow {
  readonly hash: string;
  readonly kind: AssetKind;
  readonly mime: string;
}

export async function selectOwnedReferencedAssetIds(db: Db, ownerId: UserId): Promise<Set<AssetId>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator for owned asset collection
  const ids = new Set<AssetId>();
  for (const ref of ASSET_REFS) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential DISTINCT reads over the fixed tiny registry — an export-time collection, not a hot path (mirrors `selectAllReferencedAssetIds`).
    const rows = await db
      .selectDistinct({ id: ref.column })
      .from(ref.table)
      .innerJoin(assets, eq(assets.id, ref.column))
      .where(and(isNotNull(ref.column), eq(assets.ownerId, ownerId)));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export async function selectInlineReferencedContents(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db
    .selectDistinct({ content: messageVariants.content })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, messages.chatId))
    .where(and(eq(chatParticipants.userId, ownerId), like(messageVariants.content, INLINE_REF_LIKE)));
  return rows.map((r) => r.content);
}

export async function loadOwnedAssetForExport(db: Db, ownerId: UserId, assetId: AssetId): Promise<OwnedAssetExportRow | undefined> {
  const rows = await db
    .select({ hash: assets.hash, kind: assets.kind, mime: assets.mime })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}
