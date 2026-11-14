// Retained stats scope derives through character seats, including departed seats, never funding or human visibility.
// Native cohort reads and inverse SQL projections share one session-free distinct owner/room relation.
// Husk exclusion matches the live claim and rebuild contract: an unstarted room contributes no retained economics.

import { characters, chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import type { RetainedChatOwnersQuery } from "../contract/retained-chat-accounting.ts";
import { RETAINED_CHAT_MEMBERSHIP_ALIAS } from "../contract/retained-chat-accounting.ts";

const retainedChatMembership = new QueryBuilder()
  .selectDistinct({ chatId: chatParticipants.chatId, ownerId: characters.ownerId })
  .from(chatParticipants)
  .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
  .innerJoin(chats, eq(chats.id, chatParticipants.chatId))
  .where(and(eq(chatParticipants.kind, "character"), isNotNull(chats.startedAt)))
  .as(RETAINED_CHAT_MEMBERSHIP_ALIAS);

/** The owner's chat ids as a subquery fragment — `… WHERE m.chat_id IN (${ownerChatIds(ownerId)})`.
 *  Membership-derived (an owned `character` participant) and husk-excluding, per the contract above. */
export function ownerChatIds(ownerId: string | SQL): SQL {
  return new QueryBuilder()
    .select({ chatId: retainedChatMembership.chatId })
    .from(retainedChatMembership)
    .where(eq(sql`${retainedChatMembership.ownerId}`, ownerId))
    .getSQL();
}

/** The inverse of {@link ownerChatIds}, including retained departed seats. */
export function chatOwnerIds(chatId: ChatId): SQL {
  return retainedChatOwners(chatId).getSQL();
}

/** The native cohort projection also feeds immutable accounting reads without re-reading private cards. */
export const retainedChatOwners = (chatId: ChatId): RetainedChatOwnersQuery =>
  new QueryBuilder().select({ ownerId: retainedChatMembership.ownerId }).from(retainedChatMembership).where(eq(retainedChatMembership.chatId, chatId));

/** The character-seat arm shared by rebuild census and retained-voice extrema settlement. */
export function retainedCharacterSeatPredicate(ownerId: SQL): SQL {
  return sql`c.owner_id = ${ownerId} AND cp.kind = 'character' AND ch.started_at IS NOT NULL`;
}

/** Whether the owner's character holds a seat, past seats included, in a started room: the rebuild's per-character
 *  census asked of one character, so a live write can decide inside its own statement whether the character counts. */
export function characterHoldsRetainedSeat(ownerId: UserId, characterId: CharacterId): SQL {
  return sql`exists (select 1 FROM chat_participants cp JOIN chats ch ON ch.id = cp.chat_id JOIN characters c ON c.id = cp.character_id
    WHERE cp.character_id = ${characterId} AND ${retainedCharacterSeatPredicate(sql`${ownerId}`)})`;
}
