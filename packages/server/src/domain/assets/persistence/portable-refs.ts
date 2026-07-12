// persistence/portable-refs — the OWNER-SCOPED reads that drive the assets-portability EXPORT. Three reads,
// all scoped to the exporting owner (never a cross-tenant leak):
//   1. `selectOwnedReferencedAssetIds` — the FK side: walk the asset-ref REGISTRY (`ASSET_REFS`, the same
//      single enumeration seam GC uses — NOT hand-listed) and, for each registered column, collect the ids
//      it points at that belong to THIS owner. The owner scope is the `assets` JOIN (`assets.ownerId`) — the
//      authoritative owner of the blob (the CAS partition key), independent of each referencing table's own
//      owner shape (chats have none — D18; gallery has none — owner is via the asset).
//   2. `selectInlineReferencedContents` — the TEXT side: the chat-canon `asset:<id>` refs the FK registry
//      cannot see (they live in `message_variants.content`, not an FK column — the `asset-refs` KNOWN
//      LIMITATION). Membership-scoped (`chat_participants.userId = owner`, D18 — chats have no ownerId) and
//      pre-filtered to `LIKE '%asset:%'`. Reading `chat`/`message` tables here is the SANCTIONED bulk-
//      serializer read (`@orb/db` barrel header) — it imports the shared schema, NOT the chat DOMAIN's code.
//   3. `loadOwnedAssetForExport` — the row an id resolves to FOR the owner (hash + kind + mime), or undefined
//      when the id is gone OR not theirs. This is the export's OWNER GATE: every candidate id (FK or inline)
//      is resolved through it, so an inline ref to another user's asset is silently dropped, never exported.

import type { AssetKind } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets, chatParticipants, messages, messageVariants } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, like } from "drizzle-orm";
import { ASSET_REFS } from "./asset-refs";

const LIMIT_ONE = 1;
const INLINE_REF_LIKE = "%asset:%";

// File-local read shape (not exported — types-in-contract): the columns the export needs to rebuild the
// portable filename for one owned asset.
interface OwnedAssetExportRow {
  readonly hash: string;
  readonly kind: AssetKind;
  readonly mime: string;
}

/** The set of asset ids referenced by AT LEAST ONE {@link ASSET_REFS} column AND owned by `ownerId`. The
 *  registry is the enumeration seam (one DISTINCT read per registered column, joined to `assets` for the
 *  owner scope); the union is a `Set` (an id referenced by several columns appears once). */
export async function selectOwnedReferencedAssetIds(
  db: Db,
  ownerId: UserId,
): Promise<Set<AssetId>> {
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

/** The DISTINCT `message_variants.content` strings, in chats the owner is a present-or-past MEMBER of, that
 *  MENTION an asset ref (`LIKE '%asset:%'`). The verb extracts + owner-gates the ids; this read just narrows
 *  the text to scan (membership scope + the cheap LIKE pre-filter — never a whole-corpus message read). */
export async function selectInlineReferencedContents(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db
    .selectDistinct({ content: messageVariants.content })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, messages.chatId))
    .where(
      and(eq(chatParticipants.userId, ownerId), like(messageVariants.content, INLINE_REF_LIKE)),
    );
  return rows.map((r) => r.content);
}

/** The `{hash,kind,mime}` of the caller's asset by id, or undefined when it doesn't exist OR isn't theirs.
 *  The export owner-gate + the row-rebuild source. Owner-scoped in the WHERE (no foreign-existence leak). */
export async function loadOwnedAssetForExport(
  db: Db,
  ownerId: UserId,
  assetId: AssetId,
): Promise<OwnedAssetExportRow | undefined> {
  const rows = await db
    .select({ hash: assets.hash, kind: assets.kind, mime: assets.mime })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}
