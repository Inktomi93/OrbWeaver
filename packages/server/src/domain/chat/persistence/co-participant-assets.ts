// The co-participant reference reads that let a room member render another member's assets. Every read needs a
// structural reference into a room where the CALLER is present, never a bare hash or id; a link arm also needs the
// linking message at or above the caller's history floor. The fallback order between the arms is the verb's.
//
// The owner side: each owner-gated read returns candidate rows carrying the asset owner's PRESENT seat in that row's
// room, and the verb narrows them through the room's consent set (`presentAndEnabledHumanUserIdsOf`), so a disabled
// owner's art stops exactly where a departed owner's does. Those reads take no LIMIT: a hash can sit under several
// owners (CAS dedup is per owner), and a first row whose owner is out of the consent set must not hide a later one
// that is in it. The pinned-persona read is the one exception with no owner side: the pin holds (ADR 0315).

import type { AssetBlobRef } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  chats as chatsTable,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
} from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { alias } from "drizzle-orm/sqlite-core";
import { resolveHistoryFloorSeq } from "../substrate/auth/index.ts";
import { loadPresentVisibilityRows } from "./participants-read.ts";

const LIMIT_ONE = 1;

/** The asset owner's present seat in the candidate's room, in the row shape the consent set reads. */
export interface CoParticipantOwnerCandidate {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly ownerSeat: Pick<typeof chatParticipants.$inferSelect, "kind" | "userId" | "characterId">;
}

// An aliased `chat_participants`: each read joins the table under its own alias name.
interface SeatColumns {
  readonly chatId: AnySQLiteColumn;
  readonly userId: AnySQLiteColumn;
  readonly leftSeq: AnySQLiteColumn;
}

function ownerSeatColumns<S extends { readonly kind: AnySQLiteColumn; readonly userId: AnySQLiteColumn; readonly characterId: AnySQLiteColumn }>(
  seat: S,
): Pick<S, "kind" | "userId" | "characterId"> {
  return { kind: seat.kind, userId: seat.userId, characterId: seat.characterId };
}

// The owner's PRESENT seat in the room `chatId` names; an absent or departed owner drops the row in the join.
function ownerSeatOn(seat: SeatColumns, chatId: AnySQLiteColumn): SQL | undefined {
  return and(eq(seat.chatId, chatId), eq(seat.userId, assetsTable.ownerId), isNull(seat.leftSeq));
}

// The caller's PRESENT seat in the room `chatId` names.
function callerSeatOn(seat: SeatColumns, chatId: AnySQLiteColumn, callerId: UserId): SQL | undefined {
  return and(eq(seat.chatId, chatId), eq(seat.userId, callerId), isNull(seat.leftSeq));
}

// A link below the caller's floor in its room is a reference the caller cannot see, so it grants nothing (D16).
// A room with no present caller seat fails closed.
async function linksVisibleToCaller<T extends { readonly chatId: ChatId; readonly seq: number }>(db: Db, callerId: UserId, links: readonly T[]): Promise<T[]> {
  const seats = await loadPresentVisibilityRows(db, [...new Set(links.map((link) => link.chatId))], callerId);
  return links.filter((link) => {
    const seat = seats.get(link.chatId);
    return seat !== undefined && link.seq >= resolveHistoryFloorSeq(seat);
  });
}

/** A chat render candidate: the `(assetId, hash, mime, width, height)` ref and its owner's present seat. */
export interface ChatAssetRefCandidate extends CoParticipantOwnerCandidate {
  readonly ref: AssetBlobRef;
}

/** The rows among `assetIds` with a `message_assets` row in `chatId` on a message at or above `callerId`'s history
 *  floor, where `callerId` and the asset owner are both present in that chat. One row per link; the verb dedups. */
export async function loadChatAssetRefRows(db: Db, callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]): Promise<ChatAssetRefCandidate[]> {
  const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
  const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
  // the scope is transitive: `ownerSeat` and `callerSeat` are both bound to `messagesTable.chatId`, and the WHERE pins that chat to `chatId`, so an asset returns only when a `message_assets` row links it to a message in `chatId` and both its owner's seat and the caller's seat (`callerSeat.userId = callerId`) are present there. Ends if either seat join or the `chatId` pin is dropped.
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
      ownerId: assetsTable.ownerId,
      ownerSeat: ownerSeatColumns(ownerSeat),
    })
    .from(assetsTable)
    .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
    .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
    .innerJoin(callerSeat, callerSeatOn(callerSeat, messagesTable.chatId, callerId))
    .innerJoin(ownerSeat, ownerSeatOn(ownerSeat, messagesTable.chatId))
    .where(and(eq(messagesTable.chatId, chatId), inArray(assetsTable.id, [...assetIds])));
  return linksVisibleToCaller(db, callerId, links);
}

/** Candidates for `hash` as the avatar of a character PRESENTLY rostered in a room `callerId` is present in. */
export async function loadRosteredCharacterAvatarOwners(db: Db, callerId: UserId, hash: string): Promise<CoParticipantOwnerCandidate[]> {
  const rosterChar = alias(chatParticipants, "roster_char");
  const callerSeat = alias(chatParticipants, "caller_seat");
  const ownerSeat = alias(chatParticipants, "roster_owner_seat");
  return await db
    .select({ chatId: rosterChar.chatId, ownerId: assetsTable.ownerId, ownerSeat: ownerSeatColumns(ownerSeat) })
    .from(assetsTable)
    .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
    .innerJoin(rosterChar, and(eq(rosterChar.characterId, charactersTable.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
    .innerJoin(callerSeat, callerSeatOn(callerSeat, rosterChar.chatId, callerId))
    .innerJoin(ownerSeat, ownerSeatOn(ownerSeat, rosterChar.chatId))
    .where(eq(assetsTable.hash, hash));
}

/** Candidates for `hash` as the avatar of a persona a PRESENT human seat holds active, in a room `callerId` is
 *  present in. */
export async function loadSeatedPersonaAvatarOwners(db: Db, callerId: UserId, hash: string): Promise<CoParticipantOwnerCandidate[]> {
  const personaSeat = alias(chatParticipants, "persona_seat");
  const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
  const ownerSeat = alias(chatParticipants, "persona_owner_seat");
  return await db
    .select({ chatId: personaSeat.chatId, ownerId: assetsTable.ownerId, ownerSeat: ownerSeatColumns(ownerSeat) })
    .from(assetsTable)
    .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
    .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personasTable.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
    .innerJoin(personaCallerSeat, callerSeatOn(personaCallerSeat, personaSeat.chatId, callerId))
    .innerJoin(ownerSeat, ownerSeatOn(ownerSeat, personaSeat.chatId))
    .where(eq(assetsTable.hash, hash));
}

/** The owner of `hash` when it is the avatar of the persona a room `callerId` is present in pins as its anchor
 *  (`chats.anchorPersonaId`), whoever owns it and whether or not they are still present or enabled: a held pin
 *  keeps its face (ADR 0315). The read starts at the chat's own pin, so a caller names a hash, never a persona. */
export async function loadPinnedPersonaAvatarOwner(db: Db, callerId: UserId, hash: string): Promise<UserId | undefined> {
  const pinCallerSeat = alias(chatParticipants, "pin_caller_seat");
  const rows = await db
    .select({ ownerId: assetsTable.ownerId })
    .from(assetsTable)
    .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
    .innerJoin(chatsTable, eq(chatsTable.anchorPersonaId, personasTable.id))
    .innerJoin(pinCallerSeat, callerSeatOn(pinCallerSeat, chatsTable.id, callerId))
    .where(eq(assetsTable.hash, hash))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId;
}

/** Candidates for `hash` where a `message_assets` row links it into a room where both `callerId` and the owner are
 *  present, on a message at or above `callerId`'s history floor in that room. */
export async function loadSharedAttachmentOwners(db: Db, callerId: UserId, hash: string): Promise<CoParticipantOwnerCandidate[]> {
  const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
  const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
  const links = await db
    .select({
      chatId: messagesTable.chatId,
      seq: messagesTable.seq,
      ownerId: assetsTable.ownerId,
      ownerSeat: ownerSeatColumns(attachOwnerSeat),
    })
    .from(assetsTable)
    .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
    .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
    .innerJoin(attachCallerSeat, callerSeatOn(attachCallerSeat, messagesTable.chatId, callerId))
    .innerJoin(attachOwnerSeat, ownerSeatOn(attachOwnerSeat, messagesTable.chatId))
    .where(eq(assetsTable.hash, hash));
  return linksVisibleToCaller(db, callerId, links);
}
