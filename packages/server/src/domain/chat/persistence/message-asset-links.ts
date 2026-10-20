// domain/chat/persistence/message-asset-links — QUERIES ONLY over `message_assets`, the per-(message, asset)
// link rows. Every read is chat-scoped through the `messages` join: `message_assets` has no chat column.

import { INLINE_REPLY_ORIGIN } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageAssets, messages } from "@orb/db";
import type { AssetId, ChatId, MessageId } from "@orb/kit/ids";
import { and, asc, eq, getTableColumns, inArray } from "drizzle-orm";

const LIMIT_ONE = 1;

/** THE §6.7 INLINE-REPLY ORIGIN SET — the (slot → asset ids) pairs whose `message_assets` link was stamped
 *  `inline-reply`, i.e. pictures THIS model emitted inside its own turn. It is the ONE input that lets
 *  `substrate/wire-history`'s media predicate relax for an assistant row without opening the row wholesale:
 *  an `/imagine` illustration or caller-authored generated picture is stamped `illustration` or
 *  `generated-post` and is absent here, so it stays display-only (`verbs/post-narrator-message.ts` and
 *  `verbs/generate-image.ts` are those writers).
 *
 *  KEYED ON THE PAIR, never on the asset id alone. A chat-wide id set would let ANY assistant-delivered row
 *  that merely spells `![x](asset:<id>)` ride that asset back — a world-info entry, an author's note, a card
 *  greeting, a spliced injection — because those bodies are authored text and the id is guessable from the
 *  transcript the author can already read. The link row is per (message, asset), so the predicate asks the
 *  question the origin column actually answers: did THIS slot's own generation produce this picture?
 *
 *  Chat-scoped through the `messages` join (the tenancy belt: `message_assets` has no chat column of its
 *  own), so an id from another room can never enter the map. */
export async function loadInlineReplyAssetIds(db: Db, chatId: ChatId): Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>> {
  const rows = await db
    .select({ messageId: messageAssets.messageId, assetId: messageAssets.assetId })
    .from(messageAssets)
    .innerJoin(messages, eq(messages.id, messageAssets.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageAssets.origin, INLINE_REPLY_ORIGIN)));
  // @orb-waive persistence-no-in-memory-state(Map): query-local regrouping of the link rows this query just returned. Ends if it outlives the call.
  const out = new Map<MessageId, Set<AssetId>>();
  for (const row of rows) {
    const existing = out.get(row.messageId);
    if (existing === undefined) {
      // @orb-waive persistence-no-in-memory-state(Set): the per-slot asset bucket of that same query-local regrouping. Ends if it outlives the call.
      out.set(row.messageId, new Set([row.assetId]));
    } else {
      existing.add(row.assetId);
    }
  }
  return out;
}

/** Whether a `message_assets` link of any origin places `assetId` on a message of `chatId`. Chat-scoped through
 *  the `messages` join, so a link in another room never answers for this one. */
export async function hasMessageAssetLinkInChat(db: Db, chatId: ChatId, assetId: AssetId): Promise<boolean> {
  const rows = await db
    .select({ id: messageAssets.id })
    .from(messageAssets)
    .innerJoin(messages, eq(messages.id, messageAssets.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageAssets.assetId, assetId)))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The whole `message_assets` rows on `messageIds`, chat-scoped through the `messages` join (the copy verbs' source). */
export async function loadMessageAssetLinks(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): Promise<(typeof messageAssets.$inferSelect)[]> {
  if (messageIds.length === 0) {
    return [];
  }
  return await db
    .select(getTableColumns(messageAssets))
    .from(messageAssets)
    .innerJoin(messages, eq(messages.id, messageAssets.messageId))
    .where(and(eq(messages.chatId, chatId), inArray(messageAssets.messageId, [...messageIds])))
    .orderBy(asc(messageAssets.createdAt), asc(messageAssets.id));
}
