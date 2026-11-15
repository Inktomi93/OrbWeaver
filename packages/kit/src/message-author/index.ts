// Who wrote a chat row and what sort of row it is: the participant-kind tuple (who drives a seat), the participant
// role tuple (a seated human's room authority), the message-kind tuple (a row's declared purpose), and the mappings
// from a row's attribution stamps to the kind and the standing that wrote it.
//
// The tuples live in kit because the regex executor scopes a script by them and kit cannot import contracts; the zod
// wire schemas and the per-kind policy stay in `@orb/contracts/chat`, which imports these tuples down. Pure.

import type { CharacterId, UserId } from "#ids";

/** Who drives a seat. `human` is user-backed; `character` is AI-driven. */
export const PARTICIPANT_KINDS = ["human", "character"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/** A seated human's room authority: the host, or a member. */
export const PARTICIPANT_ROLES = ["host", "member"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** What a canon row is, declared at mint. Kind never decides the row's role. */
export const MESSAGE_KINDS = ["standard", "narrator", "comment"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** The attribution stamps a row carries, as far as {@link participantOf} reads them. */
export interface RowAttribution {
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
}

/**
 * The participant kind that wrote a row, from its stamps: a user stamp is a human's hand, a character stamp with no
 * user is a character's voice. Null for a row that carries neither, such as a narrator row whose group identity was
 * deleted: the stamps are designed to degrade, so such a row matches no participant.
 */
export function participantOf(row: RowAttribution): ParticipantKind | null {
  if (row.authorUserId !== null) {
    return "human";
  }
  return row.characterId === null ? null : "character";
}

/** The room's present human seats and the authority each holds, read when a pass runs. A plain record so the
 *  serializable assembled context can carry it; a user with no entry holds no seat. */
export interface RoomStanding {
  readonly seatedRoles: Readonly<Partial<Record<UserId, ParticipantRole>>>;
}

/** A room standing with no seat, for a build that knows none. */
export const NO_SEATS: RoomStanding = { seatedRoles: {} };

/** The seat columns {@link roomStandingOf} reads; `leftSeq` is set once the seat has left the room. */
export interface StandingSeat {
  readonly userId: UserId | null;
  readonly role: ParticipantRole;
  readonly leftSeq: number | null;
}

/** The room's standing from its seats. Only a present human seat holds standing: a seat that has left holds none, as
 *  {@link standingOf} reads the room as it is now, and a seat with no user is no human's. */
export function roomStandingOf(seats: readonly StandingSeat[]): RoomStanding {
  return {
    seatedRoles: Object.fromEntries(seats.flatMap((seat) => (seat.userId === null || seat.leftSeq !== null ? [] : [[seat.userId, seat.role] as const]))),
  };
}

/**
 * The room standing of a row's author, against the room as it is now: a host handoff makes the former host's rows a
 * member's. Null for a row no seated human wrote: a character's row, and a row by a human who has left the room.
 */
export function standingOf(row: Pick<RowAttribution, "authorUserId">, room: RoomStanding): ParticipantRole | null {
  return row.authorUserId === null ? null : (room.seatedRoles[row.authorUserId] ?? null);
}
