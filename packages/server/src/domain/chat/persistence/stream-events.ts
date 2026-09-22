// domain/chat/persistence/stream-events — the `chat_stream_events` APPEND writer. The engine adds these
// statements to the SAME atomic batch that commits the destination message, so a failed/aborted turn leaves
// no speculative token rows and a committed turn cannot exist without its captured replay rows.
//
// ATTRIBUTION HAS ONE ROOT. Callers provide the server-owned message identity produced by the canon commit
// plan; every row derives both `messageId` and `chatId` from it. The delta's own chat stamp is checked before
// a statement is built, and the scalar message lookup repeats that coherence check inside the batch. A stale
// or cross-chat root therefore trips the NOT NULL constraints and rolls back the whole commit rather than
// persisting two independently stamped foreign keys.

import type { ChatDeltaEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatStreamEvents, chats, messages } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ChatId, ChatStreamEventId, ChatStreamGenerationId, MessageId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";

interface ChatStreamMessageRoot {
  readonly id: MessageId;
  readonly chatId: ChatId;
}

interface ChatStreamInsertArgs {
  readonly message: ChatStreamMessageRoot;
  readonly deltas: readonly ChatDeltaEvent[];
  readonly newEventId: () => ChatStreamEventId;
  readonly newGenerationId: () => ChatStreamGenerationId;
  readonly createdAt: number;
}

/** Build ordered token-log appends for the destination message's canon commit batch. Each row first advances
 * the chat's DB-owned cursor, then reads that head into the insert. Both statements ride the caller's one
 * transaction, so rollback restores the head and competing writers cannot allocate the same cursor. */
export function insertChatStreamEventStatements(db: Db, args: ChatStreamInsertArgs): BatchStmt[] {
  if (args.deltas.length === 0) {
    return [];
  }
  const generationId = args.newGenerationId();
  return args.deltas.flatMap((delta) => {
    if (delta.chatId !== args.message.chatId) {
      throw new Error(`chat stream event attribution mismatch: delta belongs to ${delta.chatId}, message ${args.message.id} belongs to ${args.message.chatId}`);
    }
    const anchoredChatId = sql<ChatId>`(select ${messages.chatId} from ${messages} where ${messages.id} = ${args.message.id} and ${messages.chatId} = ${args.message.chatId})`;
    const anchoredMessageId = sql<MessageId>`(select ${messages.id} from ${messages} where ${messages.id} = ${args.message.id} and ${messages.chatId} = ${args.message.chatId})`;
    return [
      batchStmt(
        db
          .update(chats)
          .set({ streamSeq: sql`${chats.streamSeq} + 1` })
          .where(eq(chats.id, args.message.chatId)),
      ),
      batchStmt(
        db.insert(chatStreamEvents).values({
          id: args.newEventId(),
          chatId: anchoredChatId,
          messageId: anchoredMessageId,
          generationId,
          seq: sql<number>`(select ${chats.streamSeq} from ${chats} where ${chats.id} = ${args.message.chatId})`,
          kind: delta.kind,
          delta: delta.text,
          createdAt: args.createdAt,
        }),
      ),
    ];
  });
}
