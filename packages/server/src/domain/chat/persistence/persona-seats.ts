import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";

/** Capture only the owner's present seats before the persona FK clears them. */
export async function loadPresentPersonaSeatChatIds(db: Db, ownerId: UserId, personaId: PersonaId): Promise<readonly ChatId[]> {
  const seats = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.activePersonaId, personaId), isNull(chatParticipants.leftSeq)));
  return seats.map((seat) => seat.chatId);
}

/** Of the captured rooms, the ones where the owner is still present and their seat is still empty. */
export async function loadStillEmptySeatChatIds(db: Db, ownerId: UserId, chatIds: readonly ChatId[]): Promise<readonly ChatId[]> {
  if (chatIds.length === 0) {
    return [];
  }
  const seats = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.userId, ownerId),
        inArray(chatParticipants.chatId, [...chatIds]),
        isNull(chatParticipants.activePersonaId),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return seats.map((seat) => seat.chatId);
}
