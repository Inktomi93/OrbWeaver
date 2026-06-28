// domain/buddy/contract/params — every verb's *Params, declared ONCE (§7.4). Under the Principal model
// every buddy verb is OWNER-SCOPED: the acting `principal` (resolved at the entry seam) carries the
// owner identity; a verb scopes its rows by `principal.userId` and NEVER reads the `users` table (the
// borrowed-owner posture, buddy.md §"the §8.6 first-class-principal (FLAG[PD-17]) transition"; PD-17 DEFER). There is
// exactly one buddy per user (PK = userId), so no per-entity id is ever passed except the ephemeral
// `proposalId` for `confirm`.

import type { Principal } from "@orb/contracts/identity";

/** Common to every buddy verb: the acting principal (`principal.userId` is the one buddy's owner). */
export interface BuddyActorParams {
  readonly principal: Principal;
}

export interface GetBuddyParams extends BuddyActorParams {}
export interface HatchBuddyParams extends BuddyActorParams {}

/** Talk to the buddy — a tool-using agent turn. The brain/credential are resolved via the injected
 *  agent-connection op (the owner gate lives in credential resolution, D17), NOT a buddy-local router. */
export interface AskBuddyParams extends BuddyActorParams {
  readonly message: string;
}

/** Confirm or cancel a proposal the buddy made during an ask. Only `confirmed: true` executes it — and
 *  `confirm` is the SOLE executor (buddy.md invariant #3). `proposalId` is the ephemeral in-memory id. */
export interface ConfirmBuddyParams extends BuddyActorParams {
  readonly proposalId: string;
  readonly confirmed: boolean;
}

export interface BuddyHistoryParams extends BuddyActorParams {}
export interface ClearBuddyChatParams extends BuddyActorParams {}

/** Toggle whether the buddy reacts to app events (the observer kill switch — observer DEFERRED). */
export interface SetReactionsParams extends BuddyActorParams {
  readonly enabled: boolean;
}

/** Toggle the buddy's "hands" — tool-using turns + confirmed mutations (the capability-ceiling kill
 *  switch, buddy.md invariant #3). */
export interface SetAgencyParams extends BuddyActorParams {
  readonly enabled: boolean;
}
