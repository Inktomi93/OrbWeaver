// The two reads behind the leak-safe reverse-room filter (`verbs/resolve-visible-rooms`): the candidate rooms the
// caller PRESENTLY sits in, and those rooms' present seats with the name inputs a roster row needs. No `users`
// join (the `no-direct-users-read` chokepoint): a human seat's handle arrives through the verb's injected op.

import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, personas } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

/** The candidate rooms among `chatIds` in which `userId` holds a PRESENT seat (`leftSeq IS NULL`). */
export async function loadSeatedRooms(
  db: Db,
  userId: UserId,
  chatIds: readonly ChatId[],
): Promise<{ readonly id: ChatId; readonly title: string | null; readonly at: number }[]> {
  return await db
    .select({ id: chats.id, title: chats.title, at: chats.updatedAt })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(and(inArray(chats.id, [...chatIds]), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)));
}

/** Every PRESENT seat of `roomIds`, in join order, with its live character name and its user's ACTIVE persona
 *  name. The persona join is owner-scoped to the seat's own user, so a persona that outlived its owner's seat
 *  can never lend its name to someone else's row. */
export async function loadRoomSeatNames(
  db: Db,
  roomIds: readonly ChatId[],
): Promise<{ readonly chatId: ChatId; readonly userId: UserId | null; readonly characterName: string | null; readonly personaName: string | null }[]> {
  return await db
    .select({
      chatId: chatParticipants.chatId,
      userId: chatParticipants.userId,
      characterName: characters.name,
      personaName: personas.name,
    })
    .from(chatParticipants)
    .leftJoin(characters, eq(chatParticipants.characterId, characters.id))
    .leftJoin(personas, and(eq(chatParticipants.activePersonaId, personas.id), eq(personas.ownerId, chatParticipants.userId)))
    .where(and(inArray(chatParticipants.chatId, [...roomIds]), isNull(chatParticipants.leftSeq)))
    .orderBy(asc(chatParticipants.joinSeq));
}
