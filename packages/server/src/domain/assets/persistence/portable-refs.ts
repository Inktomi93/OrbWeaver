// persistence/portable-refs — the owner-scoped reads that drive the assets-portability export.
// selectInlineReferencedContents reads the chat-canon asset:<id> refs no reference REGISTRY can see
// (membership-scoped, LIKE-prefiltered); loadOwnedAssetForExport is the export's owner gate — a foreign or
// missing id resolves to undefined, never exported. The REFERENCE walk itself is not here: it is the one
// collector in `asset-refs.ts` (`selectOwnedReferencedAssetIds` = the GC live set narrowed to this owner), so
// the export can never honor fewer references than GC does.

import type { AssetKind } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets, chatParticipants, messages, messageVariants } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq, like } from "drizzle-orm";

const LIMIT_ONE = 1;
const INLINE_REF_LIKE = "%asset:%";

interface OwnedAssetExportRow {
  readonly hash: string;
  readonly kind: AssetKind;
  readonly mime: string;
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
