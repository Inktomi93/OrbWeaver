import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";

/** Capture only the owner's present seats before the persona FK clears them. */
export async function loadPresentPersonaSeatChatIds(db: Db, ownerId: UserId, personaId: PersonaId): Promise<readonly ChatId[]> {
  const seats = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.activePersonaId, personaId), isNull(chatParticipants.leftSeq)));
  return seats.map((seat) => seat.chatId);
}
