// domain/chat/persistence/events — the `chat_events` APPEND writer (durable-first
// log; extracted from the inline INSERT that lived in bus.ts). Like `canon-write.ts`/`lock.ts`,
// an EXPLICIT named exception to "persistence is queries only": this is the ONE writer for the durable
// chat-bus log. The readers (`loadChatEventReplay`/`loadChatEventBounds`) stay in `queries.ts` with the rest of
// the read module.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatEvents } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ChatEventId, ChatId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

interface ChatEventInsertArgs {
  readonly id: ChatEventId;
  readonly chatId: ChatId;
  readonly event: ChatBusEvent;
  readonly createdAt: number;
}

/** An unexecuted durable-event append for a caller that already owns a wider atomic batch. `seq` must be
 * known by construction; chat birth is the sole caller and is necessarily the room's first event. */
export function insertChatEventStatement(db: Db, args: ChatEventInsertArgs & { readonly seq: number }): BatchStmt {
  return batchStmt(
    db.insert(chatEvents).values({
      id: args.id,
      chatId: args.chatId,
      seq: args.seq,
      type: args.event.type,
      payload: args.event,
      createdAt: args.createdAt,
    }),
  );
}

/** An unexecuted append with its assigned cursor returned. This is the co-statement door for a caller whose
 * adjacent durable state must commit in the same SQLite batch as the event. */
function appendChatEventStatement(db: Db, args: ChatEventInsertArgs): AwaitableBatchStmt<{ seq: number }[]> {
  return db
    .insert(chatEvents)
    .values({
      id: args.id,
      chatId: args.chatId,
      seq: sql<number>`(select coalesce(max(${chatEvents.seq}), 0) + 1 from ${chatEvents} where ${chatEvents.chatId} = ${args.chatId})`,
      type: args.event.type,
      payload: args.event,
      createdAt: args.createdAt,
    })
    .returning({ seq: chatEvents.seq });
}

/** Append only when the immediately preceding statement claimed a row. This statement must be second in one
 * SQLite batch: `changes()` is connection-local, so a zero-row claim makes this INSERT a converged no-op. */
export function appendChatEventAfterClaimStatement(db: Db, args: ChatEventInsertArgs): AwaitableBatchStmt<{ seq: number }[]> {
  return db
    .insert(chatEvents)
    .select(
      db
        .select({
          id: sql<ChatEventId>`${args.id}`.as("id"),
          chatId: sql<ChatId>`${args.chatId}`.as("chat_id"),
          seq: sql<number>`(select coalesce(max(${chatEvents.seq}), 0) + 1 from ${chatEvents} where ${chatEvents.chatId} = ${args.chatId})`.as("seq"),
          type: sql<ChatBusEvent["type"]>`${args.event.type}`.as("type"),
          payload: sql<ChatBusEvent>`${JSON.stringify(args.event)}`.as("payload"),
          createdAt: sql<number>`${args.createdAt}`.as("created_at"),
        })
        .from(sql`(select 1)`)
        .where(sql`changes() > 0`),
    )
    .returning({ seq: chatEvents.seq });
}

/**
 * Append one room-public event to the durable `chat_events` log, returning the assigned per-chat `seq`
 * (the replay cursor). The `seq` is assigned by a same-statement correlated subquery
 * (`coalesce(max(seq),0)+1`) — monotonic per chat under SQLite's serialized writes
 * (`UNIQUE(chatId, seq)`; the project's single-replica assumption). `id`/`createdAt` are CALLER-STAMPED
 * (the bus's injected minter + clock — determinism, testing §3). The caller (bus.ts) AWAITS this before
 * the in-memory ring push — durable-first, so a crash can never leave a delivered-but-unlogged event.
 */
export async function appendChatEvent(db: Db, args: ChatEventInsertArgs): Promise<number> {
  const rows = await appendChatEventStatement(db, args);
  return rows.at(0)?.seq ?? 0;
}
