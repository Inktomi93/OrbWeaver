// The keep-once write for a chat injection whose identity is its text and placement: a player's saved correction.
//
// The dedupe is the INSERT's own guard subquery, never a preceding read, so two saves of one correction that race
// each other still leave one row. The text stays non-unique in the SCHEMA, because the injections list may hold two
// rows with the same text on purpose (Add seeds blank rows); only this path narrows it, and only at the placement it
// writes, so the same words the host placed elsewhere by hand do not stand in for the kept row.
//
// TRAP: an INSERT … SELECT carries its values in a select list, where drizzle binds a bare `${value}` with no column
// encoder. Each value is bound with its own column (`sql.param`), the path `eq` and `.values()` take, so the column's
// NUL strip runs and the stored text is the text the guard compares.

import type { Db } from "@orb/db";
import { chatInjections } from "@orb/db";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, notExists, sql } from "drizzle-orm";

type ChatInjectionRow = typeof chatInjections.$inferSelect;

/** What makes two injections the same kept correction: the chat, the placement and the text. */
type KeptInjectionKey = Pick<ChatInjectionRow, "chatId" | "position" | "depth" | "role" | "content">;

/** A keep-once injection row. The verb mints the id and stamps the time from its injected clock. */
interface KeptInjectionInsert extends KeptInjectionKey {
  readonly id: ChatInjectionId;
  readonly createdAt: number;
}

function sameKeptInjection(key: KeptInjectionKey): SQL | undefined {
  return and(
    eq(chatInjections.chatId, key.chatId),
    eq(chatInjections.position, key.position),
    eq(chatInjections.depth, key.depth),
    eq(chatInjections.role, key.role),
    eq(chatInjections.content, key.content),
  );
}

/** Insert `row` unless the chat already holds the same text at the same placement. Returns the new row, or
 *  `undefined` when one already exists (read it back with {@link findKeptInjection}). */
export async function insertChatInjectionIfAbsent(db: Db, row: KeptInjectionInsert): Promise<ChatInjectionRow | undefined> {
  const inserted = await db
    .insert(chatInjections)
    .select(
      db
        .select({
          id: sql<ChatInjectionId>`${sql.param(row.id, chatInjections.id)}`.as("id"),
          chatId: sql<ChatId>`${sql.param(row.chatId, chatInjections.chatId)}`.as("chat_id"),
          position: sql<ChatInjectionRow["position"]>`${sql.param(row.position, chatInjections.position)}`.as("position"),
          depth: sql<number>`${sql.param(row.depth, chatInjections.depth)}`.as("depth"),
          role: sql<ChatInjectionRow["role"]>`${sql.param(row.role, chatInjections.role)}`.as("role"),
          content: sql<string>`${sql.param(row.content, chatInjections.content)}`.as("content"),
          order: sql<number | null>`null`.as("injection_order"),
          createdAt: sql<number>`${sql.param(row.createdAt, chatInjections.createdAt)}`.as("created_at"),
        })
        .from(sql`(select 1)`)
        .where(notExists(db.select({ id: chatInjections.id }).from(chatInjections).where(sameKeptInjection(row)))),
    )
    .returning();
  return inserted.at(0);
}

/** The chat's earliest injection with this text at this placement. */
export async function findKeptInjection(db: Db, key: KeptInjectionKey): Promise<ChatInjectionRow | undefined> {
  const rows = await db.select().from(chatInjections).where(sameKeptInjection(key)).orderBy(asc(chatInjections.createdAt), asc(chatInjections.id)).limit(1);
  return rows.at(0);
}
