// A #1584 CONVERSION REFUSAL, as DATA (#2017). One legacy gate module's recorded reason for staying on the
// legacy descriptor, in a shape something can re-derive — because the prose form could not be.
//
// WHY THIS EXISTS, AND IT IS THE ROW'S WHOLE POINT. `docs/design/gate-runtime-standardization.md`:
// ***"A REFUSAL IS A SNAPSHOT, NOT A STANDING VERDICT, and nothing re-opens one when its blocker lands"***
// (#2013). `runner-config-path-liveness` refused citing a missing `authored-path` identity door; the kind
// was SPECIFIED BY that refusal, shipped — and the module sat legacy and refusing for a day afterwards,
// because a refusal written in a header comment has no reader. The repair on 2026-09-12 was a HUMAN
// re-derivation of every surviving refusal, typed back into the same header comments, which buys exactly
// one day. This contract is the other answer: the load-bearing half of the refusal becomes a declaration,
// and `gates/conversion-refusal-liveness.ts` re-derives it on every static run.
//
// WHAT IS HELD AND WHAT IS NOT — stated here rather than discovered by a reader who assumed "declared"
// means "checked". A refusal's REASONING is prose and stays prose. What becomes data is the one condition
// `docs/design/gate-runtime-standardization.md` §12.4 states as the REOPEN BAR for the frozen resource
// vocabulary — *"the bar is two or more independent consumers, because a capability serving one gate is
// that gate's private reader wearing a contract's clothes"* (§11.5) — because that bar is a census over the
// tree, and a census is exactly the kind of claim that goes stale silently. Everything a lane could not
// mechanise goes in `unheld`, NAMED, so nothing reads the declaration's existence as "all of this is held".
//
// A BLOCKER IS A CONDITION THAT MUST STAY TRUE, never a description of one. The liveness policy asserts the
// condition and reports in BOTH directions: a NEW consumer means the reopen bar may now be met and the
// refusal is due a re-derivation; a recorded consumer that no longer carries the read means the refusal's
// own evidence is gone. Neither direction is a silent pass.

/** The frozen blocker vocabulary. One member today; a second is a ruling, exactly as §12.4's kinds are. */
export const CONVERSION_REFUSAL_BLOCKER_KINDS = ["sole-consumer"] as const;
export type ConversionRefusalBlockerKind = (typeof CONVERSION_REFUSAL_BLOCKER_KINDS)[number];

/** §12.4's reopen bar as a checkable claim: within `under`, exactly the modules in `consumers` perform the
 *  read the missing capability would serve.
 *
 *  `spellings` are matched in CODE POSITIONS ONLY — string and template-literal tokens — never in comments.
 *  That is not an optimisation: both surviving refusal headers QUOTE their own spelling repeatedly while
 *  narrating the census, and a raw-text census therefore scores a module's own prose (and any doc comment
 *  citing it) as a consumer. The header-span half of the same lesson was paid on 2026-09-12 (#2047), where
 *  a whole-file grep scored three genuinely-missing FAMILY lines as PRESENT because the modules' own proof
 *  rows quoted the field names. */
export interface SoleConsumerBlocker {
  readonly kind: "sole-consumer";
  /** The read this refusal turns on, in one sentence — what a capability would have to serve. */
  readonly why: string;
  /** Repo-relative prefix the census runs over. MUST be inside the liveness policy's own population, or
   *  the census silently measures less than it claims; the policy checks that and reports rather than
   *  narrowing quietly. */
  readonly under: string;
  /** Code spellings that mark a module as performing the read. */
  readonly spellings: readonly string[];
  /** Repo-relative module paths carrying a spelling when the refusal was last re-derived — the census
   *  RESULT, not a wish. Length above one is expressible on purpose: the refusal is then already refuted and the
   *  policy says so, rather than the shape making the defect unsayable. */
  readonly consumers: readonly string[];
}

export type ConversionRefusalBlocker = SoleConsumerBlocker;

export interface ConversionRefusal {
  /** The module's own gate id, which the loader requires to equal its basename. Pinned here so a refusal
   *  copied between modules accuses the module it was copied FROM and is caught. */
  readonly gate: string;
  /** The issue that owns the gap this refusal reports, e.g. `#1930`. */
  readonly issue: string;
  /** ISO date the blockers below were last re-derived against the tree. Never a liveness mechanism on its
   *  own — a date cannot red — but it dates the census the policy re-runs. */
  readonly rederived: string;
  /** Why the module is still legacy, in one sentence. */
  readonly why: string;
  /** Every condition that must stay true for the refusal to survive. Empty is not expressible: a refusal
   *  with no checkable blocker is prose, and prose was the defect. */
  readonly blockers: readonly [ConversionRefusalBlocker, ...ConversionRefusalBlocker[]];
  /** The parts of the refusal NOTHING here checks, each named. A tripwire that cannot fire is worse than
   *  prose, because prose does not claim to be checked. */
  readonly unheld: readonly string[];
}

/** The one authored name. The liveness policy finds the declaration by this exact binding, so it is spelled
 *  once and imported by every declaring module rather than re-typed as a magic string. */
export const CONVERSION_REFUSAL_BINDING = "CONVERSION_REFUSAL";
