// The keep-once write for a chat injection whose identity is its text: a player's saved correction.
//
// The dedupe is the INSERT's own guard subquery, never a preceding read, so two saves of one correction that race
// each other still leave one row. The text stays non-unique in the SCHEMA, because the injections list may hold two
// rows with the same text on purpose (Add seeds blank rows); only this path narrows it.

import type { Db } from "@orb/db";
import { chatInjections } from "@orb/db";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import { and, asc, eq, notExists, sql } from "drizzle-orm";

type ChatInjectionRow = typeof chatInjections.$inferSelect;

/** A keep-once injection row. The verb mints the id and stamps the time from its injected clock. */
interface KeptInjectionInsert {
  readonly id: ChatInjectionId;
  readonly chatId: ChatId;
  readonly position: ChatInjectionRow["position"];
  readonly depth: number;
  readonly role: ChatInjectionRow["role"];
  readonly content: string;
  readonly createdAt: number;
}

/** Insert `row` unless the chat already holds an injection with the same text. Returns the new row, or
 *  `undefined` when one already exists (read it back with {@link findChatInjectionByContent}). */
export async function insertChatInjectionIfAbsent(db: Db, row: KeptInjectionInsert): Promise<ChatInjectionRow | undefined> {
  const inserted = await db
    .insert(chatInjections)
    .select(
      db
        .select({
          id: sql<ChatInjectionId>`${row.id}`.as("id"),
          chatId: sql<ChatId>`${row.chatId}`.as("chat_id"),
          position: sql<ChatInjectionRow["position"]>`${row.position}`.as("position"),
          depth: sql<number>`${row.depth}`.as("depth"),
          role: sql<ChatInjectionRow["role"]>`${row.role}`.as("role"),
          content: sql<string>`${row.content}`.as("content"),
          order: sql<number | null>`null`.as("injection_order"),
          createdAt: sql<number>`${row.createdAt}`.as("created_at"),
        })
        .from(sql`(select 1)`)
        .where(
          notExists(
            db
              .select({ id: chatInjections.id })
              .from(chatInjections)
              .where(and(eq(chatInjections.chatId, row.chatId), eq(chatInjections.content, row.content))),
          ),
        ),
    )
    .returning();
  return inserted.at(0);
}

/** The chat's earliest injection whose text is exactly `content`. */
export async function findChatInjectionByContent(db: Db, chatId: ChatId, content: string): Promise<ChatInjectionRow | undefined> {
  const rows = await db
    .select()
    .from(chatInjections)
    .where(and(eq(chatInjections.chatId, chatId), eq(chatInjections.content, content)))
    .orderBy(asc(chatInjections.createdAt), asc(chatInjections.id))
    .limit(1);
  return rows.at(0);
}
