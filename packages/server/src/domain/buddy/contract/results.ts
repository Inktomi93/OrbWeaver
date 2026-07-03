// domain/buddy/contract/results — every verb's *Result + the proposal vocab + the transcript turn view
// (§7.4 one home). Holds BOTH the user-facing {@link BuddyProposal} (id/kind/summary, surfaced by `ask`)
// and the internal {@link Proposal} discriminated union (carries the action payload, stashed by a
// `propose_*` tool, executed by `confirm`). §7.5: `Proposal.kind` derives the ONE
// {@link BUDDY_PROPOSAL_KINDS} tuple; `confirm`'s switch is `assertNever`-exhaustive over it.

import type { BuddyTurnId } from "@orb/kit/ids";
import type { BuddyWorkloadKind } from "./agent-env";

// ── Buddy-chat transcript role (the STORAGE axis: user/assistant; the display view re-maps it) ──
// The TS one home for the buddy-turn storage role. The db `buddy.ts` keeps its OWN local
// `BUDDY_TURN_ROLES` tuple for the SQL CHECK (it is deliberately NOT exported from `@orb/db` — a
// "buddy-LOCAL closed set", per the schema header), so the domain owns the TS-side declaration here.
// Structurally identical to the drizzle-inferred `buddyTurns.role`, so an insert typechecks against it.
export const BUDDY_TURN_ROLES = ["user", "assistant"] as const;
export type BuddyTurnRole = (typeof BUDDY_TURN_ROLES)[number];

// ── Proposal kinds (§7.5 — ONE importable union; a new kind = member + switch arm + tool, or tsc red) ──
export const BUDDY_PROPOSAL_KINDS = ["rename", "workload"] as const;
export type BuddyProposalKind = (typeof BUDDY_PROPOSAL_KINDS)[number];

/** A pending action the buddy proposed during an ask — the UI renders Confirm/Cancel and calls
 *  `buddy.confirm` (the ONLY executor). The user-facing projection (no action payload). */
export interface BuddyProposal {
  readonly id: string;
  readonly kind: BuddyProposalKind;
  /** Human-readable, shown on the confirm row (e.g. 'Rename to "Sparkle"'). */
  readonly summary: string;
}

/** The internal proposal the agency Map stashes — carries the action payload `confirm` executes. A plain
 *  discriminated union over {@link BuddyProposalKind} (NOT an intersection — a clean discriminant the
 *  `confirm` switch narrows + `assertNever`-exhausts; §7.5 exhaustive-dispatch). */
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
  /** True when an action was applied (confirmed + executed); false when cancelled / expired / gated. */
  readonly applied: boolean;
  /** What happened, for the UI to echo (e.g. 'Now going by Sparkle.'). */
  readonly detail: string;
}

/** One persisted transcript turn, mapped for the client renderer (DB `user`→`you`, `assistant`→`buddy`). */
export interface BuddyTurnView {
  readonly id: BuddyTurnId;
  readonly role: "you" | "buddy";
  readonly text: string;
  /** epoch-ms UTC. */
  readonly createdAt: number;
}

export interface ClearBuddyChatResult {
  readonly cleared: number;
}
