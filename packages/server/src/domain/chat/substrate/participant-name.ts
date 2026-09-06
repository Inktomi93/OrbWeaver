// The ONE participant display-name rule (R10/F3 + owner ruling: no raw id ever renders) shared by the roster
// READ (`service.loadParticipantViews`) and the seat-verb returns (`verbs/participants.ts`). A ULID is not a name —
// every LIVE kind resolves to a human-legible terminal:
//   • character seat → the live card name, else the removed-character label (card deleted mid-read);
//   • human seat     → publics displayName, else its handle, else the removed-member label (publics gone).
// The `agent` arm (→ the AgentCardView soul name, else the `sourceKind` label for an unhatched buddy) grafts
// back on per PD-17/AP3-2 when the agent-principal design set returns; `observer` is unseatable by design.

/** Parenthesized-lowercase per the repo's `(unknown)` sentinel voice — the terminal when a seat's backing
 *  actor is gone (deleted character card / a human with no resolvable publics). Never the raw id. */
export const REMOVED_CHARACTER_LABEL = "(removed character)";
export const REMOVED_MEMBER_LABEL = "(removed member)";
