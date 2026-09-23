// entry/compose/visible-rooms — THE ONE LEAK-SAFE REVERSE-ROOM READ, shared by every library that keeps a
// chat-scope attachment junction. "Of these candidate rooms, which may this caller see, and what does a
// roster row need to name them."
//
// WHY IT LIVES AT THE COMPOSITION ROOT, and can live nowhere else (the `room-reach.ts` posture, and the same
// reasoning that built it here for regex in the first place): rooms carry no `ownerId` (D18), so their scope
// is `chat_participants` and their identity data is chat's — and regex, databank and preset each read
// neither. A domain may not import a sibling domain's runtime (Constitution.md §2), so the DOMAINS declare the op on
// their DI bundle (`@orb/contracts/chat`'s `ResolveVisibleRoomsOp`, one type, no near-pairs) and this ONE
// factory is wired into each of them at compose.
//
// IT WAS REGEX'S UNTIL 2026-08-19. It was built inside `compose/regex.ts` when regex was the only consumer;
// databank's "Active in" doors (#276) and the preset CONTEXT's backward bindings (#279) made it three, which
// is the one-home law's own threshold. `compose/regex.ts` now wires this factory and owns none of it.
//
// THE LEAK IT CLOSES: an attachment row OUTLIVES its author's seat, so a raw junction read names rooms the
// caller can no longer open. PRESENT membership only (`leftSeq IS NULL`); an unresolvable room is ABSENT,
// never a count residue.

import type { ResolveVisibleRoomsOp } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, personas, users } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { REMOVED_MEMBER_LABEL } from "#domain/chat";

/**
 * Build the reverse-roster room filter.
 *
 * ── SUPERSEDED RULING, RECORDED (owner pick 2026-08-09, REGROSTER's parked naming question) ──
 * This op used to return a finished `name`, and its header said, verbatim, that the middle rung of the chats
 * list's title chain — the participant-name projection — was "deliberately not re-derived here…not worth
 * making regex's cheapest read pay for it". The consequence was the reported defect: every unnamed room in
 * the regex roster read "Untitled chat" while the chats list two panes over called the same room "Azarael".
 * The owner ruled the roster should name rooms the way the chats list does.
 *
 * THE COST ARGUMENT IS PRESERVED, not discarded — it is why this is TWO statements and not an N+1:
 *   • the room read is one filtered join over an already-bounded candidate id set;
 *   • the participant-name read is ONE more statement over the ids that read returned, with the character/persona/user
 *     joins inlined. There is no per-room query, and an attachment with no visible room asks nothing.
 * What is NOT re-derived here is the title CHAIN itself: this hands back the chain's inputs and the client's
 * one `deriveChatTitle` runs it (see `VisibleRoomRef`). A second copy of the rule is what caused the defect.
 *
 * The order is `chats.updatedAt` DESC — the chats list's own ORDER BY. A name sort is no longer available
 * (the server does not know the names), and recency is the honest column: it is the order the user already
 * reads their rooms in. Id breaks the tie so a batch of same-instant rooms is stable.
 */
export function createResolveVisibleRooms(db: Db): ResolveVisibleRoomsOp {
  return async (principal, chatIds) => {
    const rooms = await db
      .select({ id: chats.id, title: chats.title, at: chats.updatedAt })
      .from(chats)
      .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
      .where(and(inArray(chats.id, [...chatIds]), eq(chatParticipants.userId, principal.userId), isNull(chatParticipants.leftSeq)));
    if (rooms.length === 0) {
      return [];
    }
    const namesByRoom = await loadRoomParticipantNames(
      db,
      rooms.map((room) => room.id),
      principal.userId,
    );
    return rooms
      .map((room) => ({ id: room.id, title: room.title, participantNames: namesByRoom.get(room.id) ?? [], at: room.at }))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  };
}

/**
 * The present characters of each visible room, as the CHATS LIST spells it — one statement, no fan-out.
 *
 * The per-seat display name is `domain/chat`'s ONE rule (`substrate/participant-name`): a character seat is
 * its live card name, a human seat is their ACTIVE PERSONA's name, else their handle, else the removed-member
 * label. It is reproduced here as JOINS rather than by calling chat's `loadParticipantViews`, because that
 * read resolves avatars, render policies and theme overrides per seat — a per-room, per-seat fan-out this
 * roster has no use for. Both FKs CASCADE (`chat_participants` header: "a deleted character leaves no roster
 * ghost"), so a present seat always has its live row and the removed-* labels are unreachable through this
 * path; they stay spelled for the persona-less human whose publics row is mid-delete.
 *
 * The persona join is OWNER-SCOPED to the seat's own user — the `resolveUserPublics` predicate verbatim, so a
 * persona that somehow outlived its owner's seat can never lend its name to someone else's row.
 *
 * VIEWER SUPPRESSION is the chats list's `summaryParticipantNames` rule, floor included: drop the caller's own seat,
 * unless dropping it would empty the row (a solo room keeps its name instead of collapsing to "Untitled").
 */
async function loadRoomParticipantNames(db: Db, roomIds: readonly ChatId[], viewerUserId: UserId): Promise<ReadonlyMap<ChatId, readonly string[]>> {
  const seats = await db
    .select({
      chatId: chatParticipants.chatId,
      userId: chatParticipants.userId,
      characterName: characters.name,
      personaName: personas.name,
      handle: users.handle,
    })
    .from(chatParticipants)
    .leftJoin(characters, eq(chatParticipants.characterId, characters.id))
    .leftJoin(users, eq(chatParticipants.userId, users.id))
    .leftJoin(personas, and(eq(chatParticipants.activePersonaId, personas.id), eq(personas.ownerId, chatParticipants.userId)))
    .where(and(inArray(chatParticipants.chatId, [...roomIds]), isNull(chatParticipants.leftSeq)))
    .orderBy(asc(chatParticipants.joinSeq));

  const byRoom = new Map<ChatId, { readonly userId: UserId | null; readonly name: string }[]>();
  for (const seat of seats) {
    const name = seat.characterName ?? seat.personaName ?? seat.handle ?? REMOVED_MEMBER_LABEL;
    const bucket = byRoom.get(seat.chatId);
    if (bucket === undefined) {
      byRoom.set(seat.chatId, [{ userId: seat.userId, name }]);
    } else {
      bucket.push({ userId: seat.userId, name });
    }
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
