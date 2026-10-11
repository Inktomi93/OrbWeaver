// The roster-avatar reference check behind the blob routes' co-participant exception. Kept apart from the
// assets seam so the assets test harness runs this exact query instead of a copy.

import type { Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
} from "@orb/db";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AssetsContext } from "#domain/assets";

/**
 * Roster-avatar reference-check, not a hash→any-owner oracle. Returns an owner only if `hash` is the
 * asset-hash of the `avatarAssetId` of either (a) a character currently rostered in a chat where `callerId`
 * is a present member, or (b) a persona that is a present human participant's `activePersonaId` in a chat
 * where `callerId` is also present, or (c) an asset a `message_assets` row links into a chat where both
 * `callerId` and the asset owner are present. Returns `assets.ownerId`, the CAS partition holding the bytes.
 */
export function createLoadCoParticipantOwner(db: Db): NonNullable<AssetsContext["loadCoParticipantOwner"]> {
  return async (callerId, hash) => {
    const rosterChar = alias(chatParticipants, "roster_char");
    const callerSeat = alias(chatParticipants, "caller_seat");
    const characterRows = await db
      .select({ ownerId: assetsTable.ownerId })
      .from(assetsTable)
      .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
      .innerJoin(rosterChar, and(eq(rosterChar.characterId, charactersTable.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
      .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
      .where(eq(assetsTable.hash, hash))
      .limit(1);
    if (characterRows[0] !== undefined) {
      return characterRows[0].ownerId;
    }

    const personaSeat = alias(chatParticipants, "persona_seat");
    const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
    const personaRows = await db
      .select({ ownerId: assetsTable.ownerId })
      .from(assetsTable)
      .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
      .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personasTable.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
      .innerJoin(
        personaCallerSeat,
        and(eq(personaCallerSeat.chatId, personaSeat.chatId), eq(personaCallerSeat.userId, callerId), isNull(personaCallerSeat.leftSeq)),
      )
      .where(eq(assetsTable.hash, hash))
      .limit(1);
    if (personaRows[0] !== undefined) {
      return personaRows[0].ownerId;
    }

    const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
    const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
    const attachmentRows = await db
      .select({ ownerId: assetsTable.ownerId })
      .from(assetsTable)
      .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
      .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
      .innerJoin(
        attachCallerSeat,
        and(eq(attachCallerSeat.chatId, messagesTable.chatId), eq(attachCallerSeat.userId, callerId), isNull(attachCallerSeat.leftSeq)),
      )
      .innerJoin(
        attachOwnerSeat,
        and(eq(attachOwnerSeat.chatId, messagesTable.chatId), eq(attachOwnerSeat.userId, assetsTable.ownerId), isNull(attachOwnerSeat.leftSeq)),
      )
      .where(eq(assetsTable.hash, hash))
      .limit(1);
    return attachmentRows[0]?.ownerId;
  };
}
