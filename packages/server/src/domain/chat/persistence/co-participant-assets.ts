// The co-participant reference reads that let a room member render another member's assets. Every read needs a
// structural reference into a room where the CALLER is present, never a bare hash or id; a link arm also needs the
// linking message at or above the caller's history floor. The fallback order between the arms is the verb's.

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
import { resolveHistoryFloorSeq } from "../substrate/auth/index.ts";
import { loadPresentVisibilityRows } from "./participants-read.ts";

const LIMIT_ONE = 1;

// A link below the caller's floor in its room is a reference the caller cannot see, so it grants nothing (D16).
// A room with no present caller seat fails closed.
async function linksVisibleToCaller<T extends { readonly chatId: ChatId; readonly seq: number }>(db: Db, callerId: UserId, links: readonly T[]): Promise<T[]> {
  const seats = await loadPresentVisibilityRows(db, [...new Set(links.map((link) => link.chatId))], callerId);
  return links.filter((link) => {
    const seat = seats.get(link.chatId);
    return seat !== undefined && link.seq >= resolveHistoryFloorSeq(seat);
  });
}

/** The `(assetId, hash, mime, width, height)` rows among `assetIds` with a `message_assets` row in `chatId` on a
 *  message at or above `callerId`'s history floor, whose owner AND `callerId` are both present members of that chat. */
export async function loadChatAssetRefRows(db: Db, callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]): Promise<AssetBlobRef[]> {
  const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
  const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
  // the scope is transitive, one hop past the gate's value-pin rule — the owner term's value is `ownerSeat.userId`, `ownerSeat` is bound to `messagesTable.chatId`, and the WHERE pins that chat to `chatId`, so an asset returns only when a `message_assets` row links it to a message in `chatId` and both its owner's seat and the caller's seat (`callerSeat.userId = callerId`) are present there. Ends if either seat join or the `chatId` pin is dropped.
  const links = await db
    .select({
      ref: {
        assetId: assetsTable.id,
        hash: assetsTable.hash,
        mime: assetsTable.mime,
        width: assetsTable.width,
        height: assetsTable.height,
      },
      chatId: messagesTable.chatId,
      seq: messagesTable.seq,
    })
    .from(assetsTable)
    .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
    .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
    .innerJoin(callerSeat, and(eq(callerSeat.chatId, messagesTable.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
    .innerJoin(ownerSeat, and(eq(ownerSeat.chatId, messagesTable.chatId), eq(ownerSeat.userId, assetsTable.ownerId), isNull(ownerSeat.leftSeq)))
    .where(and(eq(messagesTable.chatId, chatId), inArray(assetsTable.id, [...assetIds])));
  const refs = new Map<AssetId, AssetBlobRef>();
  for (const link of await linksVisibleToCaller(db, callerId, links)) {
    refs.set(link.ref.assetId, link.ref);
  }
  return [...refs.values()];
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

/** The owner of `hash` when a `message_assets` row links it into a room where both `callerId` and the owner are
 *  present, on a message at or above `callerId`'s history floor in that room. */
export async function loadSharedAttachmentOwner(db: Db, callerId: UserId, hash: string): Promise<UserId | undefined> {
  const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
  const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
  // Unlimited: each room has its own floor, so the first visible link is chosen after the read.
  const links = await db
    .select({
      ownerId: assetsTable.ownerId,
      chatId: messagesTable.chatId,
      seq: messagesTable.seq,
    })
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
    .where(eq(assetsTable.hash, hash));
  return (await linksVisibleToCaller(db, callerId, links))[0]?.ownerId;
}
