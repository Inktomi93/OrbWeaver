// domain/chat/persistence/events — the `chat_events` APPEND writer (durable-first
// log; the PD-88 extraction of the inline INSERT that lived in bus.ts). Like `canon-write.ts`/`lock.ts`,
// an EXPLICIT named exception to "persistence is queries only": this is the ONE writer for the durable
// chat-bus log. The readers (`loadChatEventReplay`/`loadChatEventBounds`) stay in `queries.ts` with the rest of
// the read module.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatEvents } from "@orb/db";
import type { ChatEventId, ChatId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

/**
 * Append one room-public event to the durable `chat_events` log, returning the assigned per-chat `seq`
 * (the replay cursor). The `seq` is assigned by a same-statement correlated subquery
 * (`coalesce(max(seq),0)+1`) — monotonic per chat under SQLite's serialized writes
 * (`UNIQUE(chatId, seq)`; the project's single-replica assumption). `id`/`createdAt` are CALLER-STAMPED
 * (the bus's injected minter + clock — determinism, testing §3). The caller (bus.ts) AWAITS this before
 * the in-memory ring push — durable-first, so a crash can never leave a delivered-but-unlogged event.
 */
export async function appendChatEvent(
  db: Db,
  args: {
    readonly id: ChatEventId;
    readonly chatId: ChatId;
    readonly event: ChatBusEvent;
    readonly createdAt: number;
  },
): Promise<number> {
  const rows = await db
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
  return rows.at(0)?.seq ?? 0;
}
