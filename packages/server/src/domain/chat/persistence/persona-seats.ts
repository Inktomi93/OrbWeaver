import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/query";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";

/** The owner's present seats wearing `personaId` move to `reseatWith`, returning each moved seat's room. Read and
 *  written in one statement, so a seat switched onto the persona at any point before the batch runs is moved too. */
export function reseatPersonaSeatsStatement(
  db: Db,
  args: { readonly ownerId: UserId; readonly personaId: PersonaId; readonly reseatWith: PersonaId },
): AwaitableBatchStmt<{ chatId: ChatId }[]> {
  return db
    .update(chatParticipants)
    .set({ activePersonaId: args.reseatWith })
    .where(and(eq(chatParticipants.userId, args.ownerId), eq(chatParticipants.activePersonaId, args.personaId), isNull(chatParticipants.leftSeq)))
    .returning({ chatId: chatParticipants.chatId });
}
