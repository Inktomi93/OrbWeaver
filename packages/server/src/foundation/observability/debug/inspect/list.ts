// foundation/observability/debug/inspect/list — the LIST probes: a lightweight row-per-chat / row-per-
// character enumeration so a harness can discover ids without re-deriving them through the client query
// cache (the per-chat `inspectChatState` and `db/stats` counts can't answer "which ids exist"). Reads
// @orb/db DOWN (no DbInspector port, ledger); synthetic characters excluded (they're not user-facing).

import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, messages } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId } from "@orb/kit/ids";
import { count, desc, eq } from "drizzle-orm";

/** One chat-list row (the discovery shape — id + title + the two headline counts + recency). */
export interface ChatListRow {
  id: ChatId;
  title: string | null;
  participantCount: number;
  messageCount: number;
  updatedAt: number;
}

/** One character-list row (id + name + handle + recency); synthetic buckets excluded. The `characters`
 *  table has no `updated_at` column (D28 flat row — only `created_at`), so recency is `createdAt`. */
export interface CharacterListRow {
  id: CharacterId;
  name: string;
  handle: CharacterHandle;
  createdAt: number;
}

/** Every chat with its participant + message counts, newest-updated first. Two grouped COUNT subqueries
 *  keep it one round-trip per table rather than N+1 per chat. */
export async function chatListSummaries(db: Db): Promise<ChatListRow[]> {
  const partCounts = await db.select({ chatId: chatParticipants.chatId, n: count() }).from(chatParticipants).groupBy(chatParticipants.chatId);
  const msgCounts = await db.select({ chatId: messages.chatId, n: count() }).from(messages).groupBy(messages.chatId);
  const partById = new Map(partCounts.map((r) => [r.chatId, Number(r.n)]));
  const msgById = new Map(msgCounts.map((r) => [r.chatId, Number(r.n)]));

  const rows = await db.select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt }).from(chats).orderBy(desc(chats.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    participantCount: partById.get(r.id) ?? 0,
    messageCount: msgById.get(r.id) ?? 0,
    updatedAt: r.updatedAt,
  }));
}

/** Every user-facing character (synthetic excluded), newest-created first. */
export async function characterListSummaries(db: Db): Promise<CharacterListRow[]> {
  const rows = await db
    .select({ id: characters.id, name: characters.name, handle: characters.handle, createdAt: characters.createdAt })
    .from(characters)
    .where(eq(characters.synthetic, false))
    .orderBy(desc(characters.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, createdAt: r.createdAt }));
}
