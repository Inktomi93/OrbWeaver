// entry/compose/emit-character-updated — the MULTI-HUMAN bridge (task #17): a `character.updated` domain
// event → a `chatUpdated` CHAT-bus event on EVERY chat where that character is CURRENTLY seated. A group room
// hosts multiple humans (neither SillyTavern nor Marinara has this); when a character's OWNER edits the card
// (name, avatar, themeOverride, depthPrompt…), every OTHER human sitting in a chat where that character is
// seated must have their open room hear it — the roster header, the bubbles' theme, the assembly-relevant
// fields. `character.updated` already rides the domain-event bus (the embeddings indexer re-embeds the card),
// but nothing told the seated chats' per-chat SSE bus, so a co-member's open room showed stale identity until a
// manual refresh. This is the compose-tier subscriber that closes that gap (the emit-chat-changed precedent:
// Principal-blind engine, membership enumerated HERE at the composition root — the lawful home for cross-cutting
// `chat_participants` reads).
//
// BUS CHOICE (chat-bus, not user-bus): this fans to the CHAT bus for OPEN-ROOM freshness — `chatUpdated` maps
// (client `BUS_FILTERS`) to the open chat's detail reads (`getChat` + `listMessages` + `listMessageVariants`)
// PLUS `listChats`, which is exactly the room-identity refetch a seated character's card change needs, with ZERO
// client edits. The user-bus `charactersChanged` already drives the character LIBRARY reads (`character.*`) — a
// DISJOINT query set — so there is no double-driver (single-driver discipline: chat-bus → the open room's
// detail, user-bus → the library list). The emit is durable-first (the injected `emitChatEvent` assigns the
// per-chat `seq` + commits the `chat_events` row before the live publish), so a device resuming the stream
// replays it like any other canon event.
//
// ALL-FIELDS, NOT A DISCRIMINATOR: `CharacterUpdatedEvent` carries only `characterId` — no identity-vs-content
// field class — so the bridge fires on EVERY card edit. House lean (task #17): a stale ANYTHING is the bug; the
// per-chat `getChat` refetch is cheap and precise, so there is no value in narrowing to "identity-only" edits.
//
// SEATED = CURRENT ROSTER ONLY (`kind='character'`, `leftSeq IS NULL`): a DEPARTED character's history rows
// carry their own snapshot identity (D28 — attribution is slot-level; a left member's past lines never
// re-voice), so a card edit must NOT fan to chats the character no longer sits in — that room's rendered
// history is frozen at what it was, and refetching it would change nothing it shows. Only present seats hear it.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";

/** Build the character→chat fan over the composition root's `db` + the durable-first chat-bus emit. Enumerates
 *  the chats where `characterId` is a PRESENT character seat (`kind='character'`, `leftSeq IS NULL`) in ONE
 *  junction query, then emits a `chatUpdated` `ChatBusEvent` per distinct chat so every subscribed device/member
 *  invalidates that room's detail. Fire-and-forget + error-isolated by the domain-event bus (`event-bus.ts`):
 *  a failed roster read/emit is logged there, never propagated to the emitting character write. */
export function createCharacterUpdatedChatFan(
  db: Db,
  emitChatEvent: (event: ChatBusEvent) => Promise<void>,
): (characterId: CharacterId) => Promise<void> {
  return async (characterId): Promise<void> => {
    const rows = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.characterId, characterId),
          eq(chatParticipants.kind, "character"),
          isNull(chatParticipants.leftSeq),
        ),
      );
    // Distinct chats — a character seats once per room, but dedupe defensively. Each chat's durable-first emit
    // is independent (its own per-chat `seq` counter), so they fan in parallel; the bus isolates any failure.
    const seatedChats = new Set<ChatId>(rows.map((row) => row.chatId));
    await Promise.all(
      [...seatedChats].map((chatId) => emitChatEvent({ type: "chatUpdated", chatId })),
    );
  };
}
