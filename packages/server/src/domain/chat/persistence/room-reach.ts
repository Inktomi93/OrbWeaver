// Departed seats never refresh historical identities; persona anchors remain live without a seat.
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { RoomSeatReach } from "../contract/room-reach.ts";

async function resolveCharacterRooms(db: Db, characterId: CharacterId): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.characterId, characterId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
  return rows.map((row) => row.chatId);
}

async function resolvePersonaRooms(db: Db, personaId: PersonaId): Promise<ChatId[]> {
  const [seated, anchored] = await Promise.all([
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.activePersonaId, personaId), isNull(chatParticipants.leftSeq))),
    db.select({ chatId: chats.id }).from(chats).where(eq(chats.anchorPersonaId, personaId)),
  ]);
  return [...seated.map((row) => row.chatId), ...anchored.map((row) => row.chatId)];
}

async function resolveMemberRooms(db: Db, userId: UserId): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, userId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  return rows.map((row) => row.chatId);
}

/** Read only the chat-owned pointers that define member-visible entity reach. */
export function createRoomSeatReach(input: DatabaseHandle): RoomSeatReach {
  const db = databaseForOwner(input);
  return {
    character: (characterId) => resolveCharacterRooms(db, characterId),
    persona: (personaId) => resolvePersonaRooms(db, personaId),
    member: (userId) => resolveMemberRooms(db, userId),
  };
}
