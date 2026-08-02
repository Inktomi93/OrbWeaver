// domain/regex/contract/dedup — the shapes the pure dedup planner (`substrate/dedup`) speaks. Homed here
// because `substrate/` is not a type home (types-in-contract): the RULE lives in substrate, its VOCABULARY
// lives here, and `persistence/` imports both to turn a plan into one batch.

import type { RegexScriptBehavior, RegexScriptCard, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";

/** A wire script split into the row's promoted columns + its behavior blob (the shape a row is built from). */
export interface SplitScript {
  readonly name: string;
  readonly enabled: boolean;
  readonly behavior: RegexScriptBehavior;
}

/** One row the lift decided to mint (the caller turns this into an insert). */
export interface PlannedInsert extends SplitScript {
  readonly id: RegexScriptId;
}

/** What the card lift resolved. `attachIds` is IN ATTACHMENT ORDER — index IS the junction `position`, so
 *  the character's execution order is the card's script order (carried references first, then the card's
 *  by-value payload in its own order). */
export interface CardLiftPlan {
  readonly inserts: readonly PlannedInsert[];
  readonly attachIds: readonly RegexScriptId[];
  /** Candidates that resolved to an EXISTING row (carried reference OR content-equal) instead of cloning. */
  readonly reused: number;
}

/** What the planner needs. `existing` + `carriedIds` are the caller's owner-scoped reads; `mintId` is the
 *  injected id minter (never an ambient mint — the determinism seam). */
export interface CardLiftInput {
  readonly existing: readonly RegexScriptRow[];
  /** Carried reference ids the caller ALREADY gated to this owner (a foreign id never reaches here). */
  readonly carriedIds: readonly RegexScriptId[];
  readonly scripts: readonly RegexScriptCard[];
  readonly mintId: () => RegexScriptId;
}
