// The chat-table reads of the co-participant art gate. Every read needs a structural reference into a room where the
// CALLER is present, never a bare hash or id; a link read also needs the linking message at or above the caller's
// history floor. The asset, character and persona rows arrive through the owner reads in `../contract/room-art-reads.ts`,
// and the verbs join them with these rows, so this file names no table chat does not own (Core-0 §4).

import type { Db } from "@orb/db";
import { chatParticipants, chats, messageAssets, messages } from "@orb/db";
import type { AssetId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { alias } from "drizzle-orm/sqlite-core";
import { resolveHistoryFloorSeq } from "../substrate/auth/index.ts";
import { loadPresentVisibilityRows } from "./participants-read.ts";

// An aliased `chat_participants`: each read joins the caller's seat under its own alias name.
interface SeatColumns {
  readonly chatId: AnySQLiteColumn;
  readonly userId: AnySQLiteColumn;
  readonly leftSeq: AnySQLiteColumn;
}

// The caller's PRESENT seat in the room `chatId` names.
function callerSeatOn(seat: SeatColumns, chatId: AnySQLiteColumn, callerId: UserId): SQL | undefined {
  return and(eq(seat.chatId, chatId), eq(seat.userId, callerId), isNull(seat.leftSeq));
}

/** A present seat in a room where the caller holds a present seat, beside that room's pin (`chats.anchorPersonaId`). */
export type CallerRoomSeat = Pick<typeof chatParticipants.$inferSelect, "chatId" | "kind" | "userId" | "characterId" | "activePersonaId"> & {
  readonly anchorPersonaId: PersonaId | null;
};

/** Every present seat of every room where `callerId` holds a present seat, the caller's own included. */
export async function loadCallerRoomSeats(db: Db, callerId: UserId): Promise<CallerRoomSeat[]> {
  const callerSeat = alias(chatParticipants, "art_caller_seat");
  return await db
    .select({
      chatId: chatParticipants.chatId,
      kind: chatParticipants.kind,
      userId: chatParticipants.userId,
      characterId: chatParticipants.characterId,
      activePersonaId: chatParticipants.activePersonaId,
      anchorPersonaId: chats.anchorPersonaId,
    })
    .from(chatParticipants)
    .innerJoin(callerSeat, callerSeatOn(callerSeat, chatParticipants.chatId, callerId))
    .innerJoin(chats, eq(chats.id, chatParticipants.chatId))
    .where(isNull(chatParticipants.leftSeq));
}

/** A `message_assets` link into a room, with the linking message's position. */
export interface RoomAssetLink {
  readonly assetId: AssetId;
  readonly chatId: ChatId;
  readonly seq: number;
}

// A link below the caller's floor in its room is a reference the caller cannot see, so it grants nothing (D16).
// A room with no present caller seat fails closed.
async function linksVisibleToCaller(db: Db, callerId: UserId, links: readonly RoomAssetLink[]): Promise<RoomAssetLink[]> {
  const seats = await loadPresentVisibilityRows(db, [...new Set(links.map((link) => link.chatId))], callerId);
  return links.filter((link) => {
    const seat = seats.get(link.chatId);
    return seat !== undefined && link.seq >= resolveHistoryFloorSeq(seat);
  });
}

async function loadVisibleAssetLinks(db: Db, callerId: UserId, assetIds: readonly AssetId[], room: SQL | undefined): Promise<RoomAssetLink[]> {
  if (assetIds.length === 0) {
    return [];
  }
  const callerSeat = alias(chatParticipants, "link_caller_seat");
  const links = await db
    .select({ assetId: messageAssets.assetId, chatId: messages.chatId, seq: messages.seq })
    .from(messageAssets)
    .innerJoin(messages, eq(messages.id, messageAssets.messageId))
    .innerJoin(callerSeat, callerSeatOn(callerSeat, messages.chatId, callerId))
    .where(and(inArray(messageAssets.assetId, [...assetIds]), room));
  return linksVisibleToCaller(db, callerId, links);
}

/** The links of `assetIds` on messages in `chatId` at or above `callerId`'s history floor there; none when the caller
 *  is not present in `chatId`. One row per link. */
export function loadVisibleAssetLinksInRoom(db: Db, callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]): Promise<RoomAssetLink[]> {
  return loadVisibleAssetLinks(db, callerId, assetIds, eq(messages.chatId, chatId));
}

/** The links of `assetIds` on messages in any room where `callerId` is present, each at or above the caller's history
 *  floor in its room. One row per link. */
export function loadVisibleAssetLinksInCallerRooms(db: Db, callerId: UserId, assetIds: readonly AssetId[]): Promise<RoomAssetLink[]> {
  return loadVisibleAssetLinks(db, callerId, assetIds, undefined);
}
