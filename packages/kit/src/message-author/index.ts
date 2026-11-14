// Who wrote a chat row and what sort of row it is: the participant-kind tuple (who drives a seat), the message-kind
// tuple (a row's declared purpose) and the one mapping from a row's attribution stamps to the kind that wrote it.
//
// The tuples live in kit because the regex executor scopes a script by them and kit cannot import contracts; the zod
// wire schemas and the per-kind policy stay in `@orb/contracts/chat`, which imports these tuples down. Pure.

import type { CharacterId, UserId } from "#ids";

/** Who drives a seat. `human` is user-backed; `character` is AI-driven. */
export const PARTICIPANT_KINDS = ["human", "character"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

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
