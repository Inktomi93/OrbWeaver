// The shape ops/spelling-twin-blindness.ts returns. Homed here because the five-slot template puts every
// exported shape in contract/ (docs/law/Core-Tooling-Law.md §2.5) and `no-inline-types`
// enforces it.

/** The two respellings `lib/spelling-twins.ts` produces, as the census's arm vocabulary. A gate is "blind"
 *  to an arm when its own `mustFlag` fixture, respelled into that arm, stops being reported. */
export const SPELLING_TWIN_ARMS = ["bracket", "namespace"] as const;
export type SpellingTwinArm = (typeof SPELLING_TWIN_ARMS)[number];

/** `gate id → the arms it stops biting under`, sorted, with blind-free gates ABSENT rather than present
 *  with an empty array — the committed ledger is a list of holes, and an empty array would be a row
 *  claiming a hole that is not there. */
export type SpellingBlindSet = Readonly<Record<string, readonly SpellingTwinArm[]>>;

/** What a census run could NOT examine, carried beside the verdict rather than dropped. A bare blind set
 *  cannot tell "nothing is blind" from "nothing was measured" (the bare-zero law), so every skip is named
 *  with its reason and the caller can assert the shape of its own coverage. */
export interface SpellingTwinSkip {
  readonly id: string;
  readonly reason: string;
}

/** One census over a mixed corpus: the blind set, plus everything the substrate could not reach. */
export interface SpellingTwinCensus {
  readonly blind: SpellingBlindSet;
  readonly skipped: readonly SpellingTwinSkip[];
  /** How many gates were actually driven — a floor a caller asserts so an empty corpus cannot read clean. */
  readonly examined: number;
}
