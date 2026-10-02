// domain/rpg/contract/results — internal actor-op, lock-merge and dice-engine results.
// Transport-visible verb results are owned by @orb/contracts/rpg.

import type { RpgActorEntry } from "@orb/contracts/rpg";

export type { CreateGameResult, HandDoorResult, PopulateResult, PromoteActorResult, ResyncResult, RollDiceResult } from "@orb/contracts/rpg";

/** What the PURE actor-op applier returns (`substrate/actor-ops.ts`): the next row, the FINE lock paths its
 *  ops earned and the pin PREFIXES its removals give back, or an errors-as-data refusal (an op naming an
 *  item/condition the actor does not carry). Homed here because a domain type has no home in the substrate
 *  that produces it (substrate-not-a-type-home).
 *
 *  `lockReleases` are PREFIXES, not paths: a removed element's own path plus everything under it. The applier
 *  is pure and never sees the stored locks, so the VERB expands each prefix against the head's own
 *  `fieldLocks` — the identical expansion `verbs/dismiss-actor.ts` performs for a whole actor. Without it a
 *  dropped item leaves pins the panel can no longer render and the host can never release (#78). */
export type ApplyActorOpsResult =
  | { readonly ok: true; readonly actor: RpgActorEntry; readonly lockPaths: readonly string[]; readonly lockReleases: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** What one lock-honoring merge produced AND what its locks cost (rule 3): the merged state plus the dotted
 *  paths whose writes the locks dropped. Homed here because a domain type has no home in the substrate that
 *  produces it (substrate-not-a-type-home) — `substrate/merge.ts` is the one producer, the staging accumulator
 *  and the flush fold are the consumers (#77). */
export interface LockedPatchOutcome<T> {
  readonly state: T;
  /** Deduplicated, in the order the walk met them. EMPTY when no lock bit. */
  readonly suppressed: readonly string[];
}

/** The raw result of ONE roll (`tools/dice.ts::rollNotation`) — the per-die faces BEFORE the modifier plus the
 *  summed total WITH it. The unbaked half of {@link RollDiceResult}: the verb stamps and echoes the notation
 *  over this. Homed here rather than in `tools/dice.ts` since 2026-08-22 (#408 — the `no-inline-types`
 *  `/tools/` clause was exempting the rpg tool subsystem by string accident; §7.4 puts a domain-internal shape
 *  in the domain's `contract/`). */
export interface DiceRoll {
  readonly faces: readonly number[];
  readonly total: number;
}
