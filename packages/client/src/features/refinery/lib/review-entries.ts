// The accept review's PURE derivation half (re-homed from the component under the components-export-
// only rule): resolve a rewrite payload's entries against the LIVE card (what apply would overwrite)
// and the session's ORIGINAL pin (the §21 divergence compare). The component (`AcceptReview`) only
// renders what this derives.

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";

/** One reviewable entry, resolved against the LIVE card and the ORIGINAL pin. */
export interface ReviewEntry {
  readonly entry: RefineryRewriteField;
  /** The LIVE card's current text for the target (what the merge overwrites). */
  readonly live: string;
  /** The session pin's text — differs from `live` exactly when the field moved under the session. */
  readonly original: string;
  readonly diverged: boolean;
}

/** Derive the reviewable entries from a rewrite payload + the two cards (pure — unit-tested through the
 *  accept-review CT's controlled lifecycle). Out-of-selection entries are dropped here so the review
 *  never PAINTS a block the apply verb would refuse (the server's belt stays the enforcer). */
export function reviewEntriesOf(
  fields: readonly RefineryRewriteField[],
  liveCard: CharacterCard,
  originalCard: CharacterCard,
  selection: RefinerySelection,
): ReviewEntry[] {
  const inScope = (entry: RefineryRewriteField): boolean => {
    if (!selection.fields.includes(entry.field)) {
      return false;
    }
    if (entry.field === "greetings" && selection.greetingIndexes !== undefined) {
      return entry.greetingIndex !== undefined && selection.greetingIndexes.includes(entry.greetingIndex);
    }
    return true;
  };
  return fields.filter(inScope).map((entry) => {
    const live = cardTextOf(liveCard, entry);
    const original = cardTextOf(originalCard, entry);
    return { entry, live, original, diverged: live !== original };
  });
}

function cardTextOf(card: CharacterCard, entry: RefineryRewriteField): string {
  if (entry.field === "greetings") {
    return entry.greetingIndex === undefined ? "" : (card.greetings[entry.greetingIndex]?.text ?? "");
  }
  if (entry.field === "depthPrompt") {
    return card.depthPrompt?.prompt ?? "";
  }
  // Every remaining refinable target is a direct nullable-string card field — the indexed read IS the
  // exhaustiveness proof (a refinable member outside `CharacterCard`'s keys fails tsc right here).
  return card[entry.field] ?? "";
}
