// The reverse assembly-pool view keeps the joined attachment/seat reads and host-only global scope.
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, chatParticipants, chats, globalBooks, personaBooks, worldBooks } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, WorldBookId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function resolveWorldInfoRooms(db: Db, bookId: WorldBookId): Promise<ChatId[]> {
  const [chatScoped, characterScoped, personaSeated, personaAnchored, globalScoped] = await Promise.all([
    db.select({ chatId: chatBooks.chatId }).from(chatBooks).where(eq(chatBooks.worldBookId, bookId)),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(characterBooks)
      .innerJoin(chatParticipants, eq(chatParticipants.characterId, characterBooks.characterId))
      .where(and(eq(characterBooks.worldBookId, bookId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(personaBooks)
      .innerJoin(chatParticipants, eq(chatParticipants.activePersonaId, personaBooks.personaId))
      .where(and(eq(personaBooks.worldBookId, bookId), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chats.id })
      .from(personaBooks)
      .innerJoin(chats, eq(chats.anchorPersonaId, personaBooks.personaId))
      .where(eq(personaBooks.worldBookId, bookId)),
    // The global arm resolves the book's OWNER first (the tenant scope the pool applies), then that owner's
    // hosted rooms. `inArray` over the one-row owner select keeps it a single round trip.
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          inArray(
            chatParticipants.userId,
            // @orb-waive owner-scoped-reads(worldBooks): the global-book lookup reads only its owner id to select present host room ids, held server-side until fan. Book removal fans only after its owner-scoped DELETE RETURNING succeeded; attachment removals fan only after their owner-gated parent/book junction DELETE RETURNING succeeded; content events follow committed owner-gated writes. Foreign/missing/no-op writes discard the capture. Ends if a capture can fan without the confirmed scoped write, or these ids leave the server by another path.
            db
              .select({ ownerId: worldBooks.ownerId })
              .from(globalBooks)
              .innerJoin(worldBooks, eq(worldBooks.id, globalBooks.worldBookId))
              .where(eq(globalBooks.worldBookId, bookId)),
          ),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  ]);
  return [...chatScoped, ...characterScoped, ...personaSeated, ...personaAnchored, ...globalScoped].map((row) => row.chatId);
}

/** Bind the book owner's attachment-to-room read; the caller owns the post-write fan decision. */
export function createWorldInfoRoomReach(handle: DatabaseHandle): (bookId: WorldBookId) => Promise<ChatId[]> {
  const db = databaseForOwner(handle);
  return (bookId) => resolveWorldInfoRooms(db, bookId);
}
