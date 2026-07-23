// The ONE participant display-name rule (R10/F3 + owner ruling: no raw id ever renders) shared by the roster
// READ (`service.loadParticipantViews`) and the seat-verb returns (`verbs/roster.ts`). A ULID is not a name —
// every kind resolves to a human-legible terminal:
//   • character seat → the live card name, else the removed-character label (card deleted mid-read);
//   • human seat     → publics displayName, else its handle, else the removed-member label (publics gone);
//   • agent seat     → the AgentCardView soul name (the compose `AGENT_SPEAKER_SOURCES` dispatch), else the
//                      `sourceKind` label for an UNHATCHED buddy (resolves satellite-only, never the ULID).

/** Parenthesized-lowercase per the repo's `(unknown)` sentinel voice — the terminal when a seat's backing
 *  actor is gone (deleted character card / a human with no resolvable publics). Never the raw id. */
export const REMOVED_CHARACTER_LABEL = "(removed character)";
export const REMOVED_MEMBER_LABEL = "(removed member)";
