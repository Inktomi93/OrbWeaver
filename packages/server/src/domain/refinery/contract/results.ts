// Server-only refinery round claims, model facts and acceptance decisions; wire outputs live in contracts.

import type { CharacterCard } from "@orb/contracts/character";
import type { DroppedField, RefineryRewriteField } from "@orb/contracts/refinery";
import type { ModelId } from "@orb/kit/ids";

/** A held ROUND CLAIM (#1568) — what `substrate/round-claim.ts::takeRoundClaim` hands back and what
 *  `releaseRoundClaim` requires. The deadline is the claim's IDENTITY, not merely its expiry: the release is
 *  matched on it, so a round whose lease already lapsed cannot clear its successor's claim. */
export interface RefineryRoundClaim {
  readonly leaseUntil: number;
}

/** The summarize-slot FACTS one refinery call reads off the owner's bundle (`substrate/summarizer.ts`):
 *  which model answers and how wide its window is. Read per call, never boot-frozen. */
export interface SummarizerFacts {
  readonly model: ModelId;
  /** The resolved model's context window (tokens); `null` when the capability declares none. */
  readonly contextTokens: number | null;
}

/** One accept's belt verdict (the shared accept-belts substrate's output — both terminal verbs consume
 *  it; homed here per §7.4, the one type home). */
export type AcceptVerdict = { readonly kind: "apply"; readonly entry: RefineryRewriteField } | { readonly kind: "drop"; readonly drop: DroppedField };

/** The belt inputs one apply call classifies every accept against (derived once, up front — the
 *  accept-belts substrate's contract). */
export interface AcceptBelts {
  readonly rewriteFields: readonly RefineryRewriteField[];
  readonly selectedFields: readonly string[];
  /** The selection's greeting-index narrowing — `undefined` means every greeting is in scope (contracts
   *  law). When it IS an array, an accept for a greeting index outside it is scope-widening past what the
   *  user selected (belt 9). */
  readonly selectedGreetingIndexes: readonly number[] | undefined;
  readonly liveGreetingCount: number;
  readonly liveHasDepthPrompt: boolean;
  /** The payload's APPEND entries in payload order (`appendedRewrites`) — the list an accept's
   *  `appendIndex` addresses into. Derived once, up front, exactly like the rest of this bundle. */
  readonly appendedFields: readonly Extract<RefineryRewriteField, { append: true }>[];
  /** The §21 divergence pair: the session's pin and the card the write would land on. */
  readonly originalCard: CharacterCard;
  readonly liveCard: CharacterCard;
}
