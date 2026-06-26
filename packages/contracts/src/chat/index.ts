// Roster participant kind — the chat-roster discriminator (participants-agents-identity.md §1). Reserved
// NOW with the `'observer'` seam (reports/COUNCIL-REVIEW.md / DECISIONS-LEDGER §5): the per-chat
// Narrative Director is an `'observer'` agent that watches + proposes (WI / steering), never acts.
// `'human'`/`'character'` are the v1 kinds; `'agent'` (first-class agent principal, _FANOUT-BRIEF §8.6)
// joins this union when that build lands. The rest of the chat contract (AssembleContext, deltas, …)
// fills in at Phase 2. Self-registering `as const` tuple (no-inline-union-redecl).
export const PARTICIPANT_KINDS = ["human", "character", "observer"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
