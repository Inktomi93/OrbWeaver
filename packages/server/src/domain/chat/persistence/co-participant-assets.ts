// The co-participant reference reads that let a room member render another member's assets. Every read starts
// from the asset and requires a structural reference into a room where the CALLER is a present member; a hash
// or an id alone never resolves. The fallback order between the avatar and attachment arms is the verb's.

import type { AssetBlobRef } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
} from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

const LIMIT_ONE = 1;

/** The `(assetId, hash, mime, width, height)` rows among `assetIds` with a `message_assets` row in `chatId`, whose
 *  owner AND `callerId` are both present members of that chat. */
export async function loadChatAssetRefRows(db: Db, callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]): Promise<AssetBlobRef[]> {
  const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
  const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
  return await db
    .selectDistinct({
      assetId: assetsTable.id,
      hash: assetsTable.hash,
      mime: assetsTable.mime,
      width: assetsTable.width,
      height: assetsTable.height,
    })
    .from(assetsTable)
    .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
    .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
    .innerJoin(callerSeat, and(eq(callerSeat.chatId, messagesTable.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
    .innerJoin(ownerSeat, and(eq(ownerSeat.chatId, messagesTable.chatId), eq(ownerSeat.userId, assetsTable.ownerId), isNull(ownerSeat.leftSeq)))
    .where(and(eq(messagesTable.chatId, chatId), inArray(assetsTable.id, [...assetIds])));
}

/** The owner of `hash` when it is the avatar of a character PRESENTLY rostered in a room `callerId` is present in. */
export async function loadRosteredCharacterAvatarOwner(db: Db, callerId: UserId, hash: string): Promise<UserId | undefined> {
  const rosterChar = alias(chatParticipants, "roster_char");
  const callerSeat = alias(chatParticipants, "caller_seat");
  const rows = await db
    .select({ ownerId: assetsTable.ownerId })
    .from(assetsTable)
    .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
    .innerJoin(rosterChar, and(eq(rosterChar.characterId, charactersTable.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
    .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
    .where(eq(assetsTable.hash, hash))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId;
}

/** The owner of `hash` when it is the avatar of a persona a PRESENT human seat holds active, in a room `callerId`
 *  is present in. */
export async function loadSeatedPersonaAvatarOwner(db: Db, callerId: UserId, hash: string): Promise<UserId | undefined> {
  const personaSeat = alias(chatParticipants, "persona_seat");
  const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
  const rows = await db
    .select({ ownerId: assetsTable.ownerId })
    .from(assetsTable)
    .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
    .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personasTable.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
    .innerJoin(
      personaCallerSeat,
      and(eq(personaCallerSeat.chatId, personaSeat.chatId), eq(personaCallerSeat.userId, callerId), isNull(personaCallerSeat.leftSeq)),
    )
    .where(eq(assetsTable.hash, hash))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId;
}

/** The owner of `hash` when a `message_assets` row links it into a room where both `callerId` and the owner are present. */
export async function loadSharedAttachmentOwner(db: Db, callerId: UserId, hash: string): Promise<UserId | undefined> {
  const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
  const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
  const rows = await db
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
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId;
}
