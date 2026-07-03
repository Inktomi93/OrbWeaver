// domain/buddy/agency/proposals — the propose/confirm gate, structurally. The
// buddy AGENT never holds a mutating tool; its only "action" tools are read-only `propose_*` tools that
// STASH a Proposal here and hand the user a summary. Nothing changes until the user clicks Confirm, which
// calls `buddy.confirm` — the ONLY thing that executes the pending action. A runaway/confused model can
// suggest, never act.
//
// ASSUMES(single-replica): the `pendingByUser` map is module-scope in-memory state (TTL'd, keyed by
// userId, replace-on-new) — correct for our ONE replica (a locked NOTE, not a bug).
// IF reversed, a propose on replica A + the matching confirm on replica B would miss each other (the
// confirm reports "expired"); the DB-backed replacement seam is then a `buddy_proposals` table (same TTL
// + replace/atomic semantics). Lives in `agency/` (NOT `persistence/`) precisely because it is
// per-process state, not a query (`persistence-no-in-memory-state`).

import type { UserId } from "@orb/kit/ids";
import type { Proposal } from "../contract/results";

interface Pending {
  readonly proposal: Proposal;
  readonly expiresAt: number;
}

const PROPOSAL_TTL_MS = 300_000; // 5 minutes

// Keyed by userId — ONE outstanding proposal per user (a new propose replaces the old).
const pendingByUser = new Map<UserId, Pending>();

function sweep(now: number): void {
  for (const [user, p] of pendingByUser) {
    if (p.expiresAt <= now) {
      pendingByUser.delete(user);
    }
  }
}

/** Stash a proposal for the user; returns its id. Replaces any prior outstanding one. */
export function stashProposal(userId: UserId, proposal: Proposal, now: number): string {
  sweep(now);
  pendingByUser.set(userId, { proposal, expiresAt: now + PROPOSAL_TTL_MS });
  return proposal.id;
}

/** The user's current outstanding proposal (for surfacing in the ask result), or null. */
export function peekProposal(userId: UserId, now: number): Proposal | null {
  const p = pendingByUser.get(userId);
  if (p === undefined || p.expiresAt <= now) {
    return null;
  }
  return p.proposal;
}

/** Consume the proposal IF its id matches — returns it (and clears) or null (expired / id mismatch). */
export function takeProposal(userId: UserId, proposalId: string, now: number): Proposal | null {
  const p = pendingByUser.get(userId);
  if (p === undefined || p.expiresAt <= now || p.proposal.id !== proposalId) {
    return null;
  }
  pendingByUser.delete(userId);
  return p.proposal;
}

/** Drop the user's outstanding proposal (Cancel). */
export function clearProposal(userId: UserId): void {
  pendingByUser.delete(userId);
}
