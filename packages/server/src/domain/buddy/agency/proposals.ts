// domain/buddy/agency/proposals — the propose/confirm gate. The buddy agent never holds a mutating tool;
// its propose_* tools stash a Proposal here. Nothing changes until buddy.confirm executes it. Assumes
// single-replica: pendingByUser is module-scope in-memory state, TTL'd, keyed by userId, replace-on-new.

import type { UserId } from "@orb/kit/ids";
import type { Proposal } from "../contract/results";

interface Pending {
  readonly proposal: Proposal;
  readonly expiresAt: number;
}

const PROPOSAL_TTL_MS = 300_000;

// ASSUMES(single-replica): per-process pending-proposal state — a second replica would split it.
const pendingByUser = new Map<UserId, Pending>();

function sweep(now: number): void {
  for (const [user, p] of pendingByUser) {
    if (p.expiresAt <= now) {
      pendingByUser.delete(user);
    }
  }
}

export function stashProposal(userId: UserId, proposal: Proposal, now: number): string {
  sweep(now);
  pendingByUser.set(userId, { proposal, expiresAt: now + PROPOSAL_TTL_MS });
  return proposal.id;
}

export function peekProposal(userId: UserId, now: number): Proposal | null {
  const p = pendingByUser.get(userId);
  if (p === undefined || p.expiresAt <= now) {
    return null;
  }
  return p.proposal;
}

export function takeProposal(userId: UserId, proposalId: string, now: number): Proposal | null {
  const p = pendingByUser.get(userId);
  if (p === undefined || p.expiresAt <= now || p.proposal.id !== proposalId) {
    return null;
  }
  pendingByUser.delete(userId);
  return p.proposal;
}

export function clearProposal(userId: UserId): void {
  pendingByUser.delete(userId);
}
