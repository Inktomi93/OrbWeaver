// domain/buddy/contract/results — every verb's *Result + the proposal vocab + the transcript turn view.
// BuddyProposal is the user-facing projection (surfaced by ask); Proposal is the internal discriminated
// union carrying the action payload, stashed by a propose_* tool, executed by confirm.

import type { BuddyTurnId } from "@orb/kit/ids";
import type { BuddyWorkloadKind } from "./agent-env";

// The db buddy.ts keeps its OWN local BUDDY_TURN_ROLES tuple for the SQL CHECK (deliberately not exported
// from @orb/db), so the domain owns the TS-side declaration here, structurally identical to the drizzle-
// inferred buddyTurns.role.
export const BUDDY_TURN_ROLES = ["user", "assistant"] as const;
export type BuddyTurnRole = (typeof BUDDY_TURN_ROLES)[number];

// A new kind = member + switch arm + tool, or tsc red.
export const BUDDY_PROPOSAL_KINDS = ["rename", "workload"] as const;
export type BuddyProposalKind = (typeof BUDDY_PROPOSAL_KINDS)[number];

/** The UI renders Confirm/Cancel and calls buddy.confirm (the only executor). */
export interface BuddyProposal {
  readonly id: string;
  readonly kind: BuddyProposalKind;
  readonly summary: string;
}

export type Proposal =
  | {
      readonly id: string;
      readonly summary: string;
      readonly kind: "rename";
      readonly newName: string;
    }
  | {
      readonly id: string;
      readonly summary: string;
      readonly kind: "workload";
      readonly workloadKind: BuddyWorkloadKind;
    };

export interface AskBuddyResult {
  readonly reply: string;
  readonly proposal?: BuddyProposal | undefined;
}

export interface ConfirmBuddyResult {
  readonly applied: boolean;
  readonly detail: string;
}

export interface BuddyTurnView {
  readonly id: BuddyTurnId;
  readonly role: "you" | "buddy";
  readonly text: string;
  readonly createdAt: number;
}

export interface ClearBuddyChatResult {
  readonly cleared: number;
}
