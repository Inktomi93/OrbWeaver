// The HAND-EDIT dialog's target derivation — the pure half of "which slots may a human type into, and
// what is in them right now". Re-homed out of `surfaces/refinery-content-surface.tsx` (#2243: 451 lines
// against the 450 cap), on the seam `lib/review-entries.ts` already established in this feature — "the
// PURE derivation half … the component only renders what this derives".
//
// It is its own module rather than a row in an existing lib file because it answers a question nothing
// else in the workbench asks: every other derivation here is about a RUN (a score payload, a rewrite's
// reviewable entries, a lane's cross-claims), and this one is about the LIVE CARD's addressable text with
// no run involved at all. The manual path exists precisely for when no run is worth waiting for.

import type { RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";

/** One addressable slot the hand-edit dialog offers. It lives HERE rather than beside the dialog for two
 *  reasons: `components/*.tsx` exports components (the rule `lib/review-entries.ts` was re-homed under),
 *  and a `lib/` module that imports a `.tsx` for a TYPE drags the whole DOM component graph into the
 *  NODE-world compiler program that owns this file's unit test — measured at 227 `lib="dom"` errors from
 *  that one type-only import. */
export interface ManualTarget {
  readonly field: RefineryRewriteField["field"];
  readonly greetingIndex?: number | undefined;
  /** The working text the edit starts from (the same overlay the model's rewrite would see). */
  readonly text: string;
}

/** The card fields the hand-edit dialog can address. Local and unexported: the ONE consumer is
 *  `manualTargetsOf` below, so widening it into a shared shape would claim a reuse that does not exist. */
type ManualCard = Parameters<typeof manualTextOf>[0] & { greetings: readonly { text: string }[] };

/** The hand-edit dialog's targets: exactly the SELECTION's addressable fields with their CURRENT live
 *  text (out-of-range greeting indexes are dropped — the dialog never offers a slot that cannot land). */
export function manualTargetsOf(selection: RefinerySelection, card: ManualCard): ManualTarget[] {
  return selection.fields.flatMap((field): ManualTarget[] => {
    if (field === "greetings") {
      const indexes = selection.greetingIndexes ?? card.greetings.map((_, i) => i);
      return indexes.filter((i) => i < card.greetings.length).map((i) => ({ field, greetingIndex: i, text: card.greetings[i]?.text ?? "" }));
    }
    return [{ field, text: manualTextOf(card, field) }];
  });
}

/** @public — exported so the field switch (the depth-prompt unwrap in particular) gets its own direct
 *  unit test, separate from `manualTargetsOf`'s selection/greeting machinery; internal use above is real
 *  but not the only reason this stays exported. */
export function manualTextOf(
  card: {
    description: string | null;
    personality: string | null;
    scenario: string | null;
    exampleMessages: string | null;
    systemPrompt: string | null;
    postHistoryInstructions: string | null;
    creatorNotes: string | null;
    depthPrompt: { prompt: string } | null;
  },
  field: string,
): string {
  switch (field) {
    case "description":
      return card.description ?? "";
    case "personality":
      return card.personality ?? "";
    case "scenario":
      return card.scenario ?? "";
    case "exampleMessages":
      return card.exampleMessages ?? "";
    case "systemPrompt":
      return card.systemPrompt ?? "";
    case "postHistoryInstructions":
      return card.postHistoryInstructions ?? "";
    case "depthPrompt":
      return card.depthPrompt === null ? "" : card.depthPrompt.prompt;
    case "creatorNotes":
      return card.creatorNotes ?? "";
    default:
      return "";
  }
}
