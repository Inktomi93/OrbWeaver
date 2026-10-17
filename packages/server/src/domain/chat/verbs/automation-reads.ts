// An automation fact is scoped to both message and room, and reads the selected canon variant.

import type { TriggerFact } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { ChatAutomationReads } from "../contract/automation-reads.ts";
import { loadTurnOrigin } from "../persistence/queries.ts";

const LIMIT_ONE = 1;

/** The triggering message projected to the CEL fact — the SELECTED variant's content (D26). Null on a raced
 *  delete (the id names no live slot) OR when the id does not belong to `chatId`.
 *
 *  SCOPED BY THE CHAT, not by the id alone (#1456): the resolver hands this op the room the event fired in,
 *  and the fact it returns is what reaches third-party automation rules and plugin guest code. Looking the
 *  message up by id alone let a malformed, stale or cross-wired event hydrate a fact out of ANOTHER room. */
async function getAutomationMessageFact(db: Db, chatId: ChatId, messageId: MessageId): Promise<NonNullable<TriggerFact["message"]> | null> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      authorUserId: messages.authorUserId,
      characterId: messages.characterId,
      seq: messages.seq,
      content: messageVariants.content,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
    .limit(LIMIT_ONE);
  return rows[0] ?? null;
}

async function readChatColumn(db: Db, chatId: ChatId, column: "runtime" | "choice"): Promise<Record<string, string>> {
  const rows = await db.select({ runtime: chats.runtimeVariables, choice: chats.variableValues }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  return rows[0]?.[column] ?? {};
}

/** Bind the room-owned fact and both variable planes to one database. */
export function createChatAutomationReads(input: DatabaseHandle): ChatAutomationReads {
  const db = databaseForOwner(input);
  return {
    getMessageFact: (chatId, messageId) => getAutomationMessageFact(db, chatId, messageId),
    getTurnOrigin: (chatId, messageId) => loadTurnOrigin(db, chatId, messageId),
    readVariables: (chatId) => readChatColumn(db, chatId, "runtime"),
    readChoicePicks: (chatId) => readChatColumn(db, chatId, "choice"),
  };
}
