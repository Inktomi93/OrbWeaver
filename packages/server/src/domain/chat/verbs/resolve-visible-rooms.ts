// The ONE leak-safe reverse-room read, shared by every library that keeps a chat-scope attachment junction (regex
// scripts, databank documents, the rpg GM preset): of these candidate rooms, which may this caller see, and what
// does a roster row need to name them. Rooms carry no `ownerId` (D18), so their scope and identity are chat's, and
// each consuming domain declares `ResolveVisibleRoomsOp` and receives this factory at compose.
//
// THE LEAK IT CLOSES: an attachment row OUTLIVES its author's seat, so a raw junction read names rooms the caller can
// no longer open. PRESENT membership only (`leftSeq IS NULL`); an unresolvable room is ABSENT, never a count residue.
//
// It hands back the title CHAIN's inputs, never a finished name: the client's one `deriveChatTitle` runs the chain,
// as on the chats list (owner ruling, REGROSTER). That costs two statements, never one per room: the room read over
// the bounded candidate set, then one seat read over the rooms it returned, plus one batched handle read.
//
// The per-seat display name is chat's rule (`substrate/participant-name`): a character seat is its live card name, a
// human seat is their ACTIVE PERSONA's name, else their handle, else the removed-member label. VIEWER SUPPRESSION is
// the chats list's `summaryParticipantNames` rule: drop the caller's own seat, unless that would empty the row.

import type { ResolveVisibleRoomsOp } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { LoadUserHandlesOp } from "../contract/context.ts";
import { loadRoomSeatNames, loadSeatedRooms } from "../persistence/visible-rooms.ts";
import { REMOVED_MEMBER_LABEL } from "../substrate/participant-name.ts";

interface NamedSeat {
  readonly userId: UserId | null;
  readonly name: string;
}

/** The present seat names of each room, viewer-suppressed, in roster order. */
async function roomParticipantNames(
  ctx: Pick<ChatContext, "db">,
  loadUserHandles: LoadUserHandlesOp,
  roomIds: readonly ChatId[],
  viewerUserId: UserId,
): Promise<ReadonlyMap<ChatId, readonly string[]>> {
  const seats = await loadRoomSeatNames(ctx.db, roomIds);
  const handles = new Map(
    (await loadUserHandles([...new Set(seats.flatMap((seat) => (seat.userId === null ? [] : [seat.userId])))])).map((row) => [row.id, row.handle]),
  );
  const byRoom = new Map<ChatId, NamedSeat[]>();
  for (const seat of seats) {
    const handle = seat.userId === null ? undefined : handles.get(seat.userId);
    const name = seat.characterName ?? seat.personaName ?? handle ?? REMOVED_MEMBER_LABEL;
    byRoom.getOrInsertComputed(seat.chatId, () => []).push({ userId: seat.userId, name });
  }
  const namesByRoom = new Map<ChatId, readonly string[]>();
  for (const [chatId, bucket] of byRoom) {
    const others = bucket.filter((seat) => seat.userId !== viewerUserId);
    namesByRoom.set(
      chatId,
      (others.length > 0 ? others : bucket).map((seat) => seat.name),
    );
  }
  return namesByRoom;
}

export function createResolveVisibleRooms(ctx: Pick<ChatContext, "db">, loadUserHandles: LoadUserHandlesOp): ResolveVisibleRoomsOp {
  return async (principal, chatIds) => {
    const rooms = await loadSeatedRooms(ctx.db, principal.userId, chatIds);
    if (rooms.length === 0) {
      return [];
    }
    const namesByRoom = await roomParticipantNames(
      ctx,
      loadUserHandles,
      rooms.map((room) => room.id),
      principal.userId,
    );
    return rooms
      .map((room) => ({ id: room.id, title: room.title, participantNames: namesByRoom.get(room.id) ?? [], at: room.at }))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  };
}
