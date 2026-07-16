// Multi-human bridge: a `character.updated` domain event → a `chatUpdated` chat-bus event on every chat
// where that character is currently seated, so a co-member's open room hears a card edit without a manual
// refresh. Fans to the chat bus (not the user-bus `charactersChanged`, which drives the library list) —
// disjoint query sets, no double-driver. Only present seats (`leftSeq IS NULL`) hear it: a departed
// character's history rows carry their own snapshot identity and must stay frozen.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";

/** Build the character→chat fan: enumerate chats where `characterId` is a present seat, then emit a
 *  `chatUpdated` event per distinct chat. Fire-and-forget + error-isolated by the domain-event bus. */
export function createCharacterUpdatedChatFan(db: Db, emitChatEvent: (event: ChatBusEvent) => Promise<void>): (characterId: CharacterId) => Promise<void> {
  return async (characterId): Promise<void> => {
    const rows = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.characterId, characterId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    const seatedChats = new Set<ChatId>(rows.map((row) => row.chatId));
    await Promise.all([...seatedChats].map((chatId) => emitChatEvent({ type: "chatUpdated", chatId })));
  };
}
