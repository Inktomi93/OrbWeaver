// domain/buddy/substrate/gate — the SUBSTRATE MEDIATOR for the `agency/` subsystem (the propose/confirm
// gate + the hourly mutation rate-limit). `domain-substrate-mediates-subsystems`: a verb (`ask`/`confirm`)
// — and the sibling `agent/` subsystem's tools — reach the agency state ONLY through `substrate/`, never
// the named subsystem directly (which would hide the dep from the composition root + make the subsystem
// refactor-unsafe). This is the single seam; it wraps the raw per-process Maps in the gate's intent-level
// operations (mirrors `credentials/substrate/health-throttle` wrapping `health/cache`). `now` is the
// injected clock value (testing §3) — passed in, never read from a wall-clock here.

import { clearProposal, peekProposal, stashProposal, takeProposal } from "../agency/proposals";
import { allowMutation } from "../agency/rate-limit";
import type { Proposal } from "../contract/results";

/** Stash a proposal (the only effect of a propose_* tool); returns its id. Replaces any prior one. */
export function proposeAction(userId: Parameters<typeof stashProposal>[0], proposal: Proposal, now: number): string {
  return stashProposal(userId, proposal, now);
}

/** The user's outstanding proposal, if any — `ask` surfaces it on the result. */
export function pendingProposal(userId: Parameters<typeof peekProposal>[0], now: number): Proposal | null {
  return peekProposal(userId, now);
}

/** Consume the proposal by id (the `confirm` execute path), or null if expired / id-mismatched. */
export function claimProposal(userId: Parameters<typeof takeProposal>[0], proposalId: string, now: number): Proposal | null {
  return takeProposal(userId, proposalId, now);
}

/** Drop the outstanding proposal (the `confirm` cancel path). */
export function dropProposal(userId: Parameters<typeof clearProposal>[0]): void {
  clearProposal(userId);
}

/** Whether a confirmed mutation is within the hourly budget (records a slot when true; the capability
 *  ceiling). */
export function withinMutationBudget(userId: Parameters<typeof allowMutation>[0], now: number): boolean {
  return allowMutation(userId, now);
}
