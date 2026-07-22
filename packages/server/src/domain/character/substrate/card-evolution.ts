// domain/character/substrate/card-evolution — pure apply logic for accepted card-evolution changes (zero
// I/O). A proposal's typed `{field, op, text}[]` (chat-crew-design/03 §2) folds over the live card: `append`
// concatenates onto the existing field (blank field ⇒ the text alone), `replace` overwrites. The evolvable
// set is deliberately conservative (description/personality/scenario/creatorNotes) — never name/systemPrompt/
// postHistory (steering internals are the author's, not play's), which the `cardEvolutionChangeSchema` enum
// already fences; this layer only trusts that fence, it does not re-decide it.

import type { CharacterCard } from "@orb/contracts/character";
import type { CardEvolutionChange } from "@orb/contracts/crew";

// The two-newline join keeps appended drift as its own paragraph rather than run-on prose.
const APPEND_SEPARATOR = "\n\n";

/** Fold accepted changes onto a card, returning a fresh card (the input is never mutated). */
export function applyCardEvolutionChanges(base: CharacterCard, changes: readonly CardEvolutionChange[]): CharacterCard {
  let next = base;
  for (const change of changes) {
    // The evolvable fields are nullable on the card (an unset field is null); treat null as empty for the fold.
    const current = next[change.field] ?? "";
    const applied = change.op === "replace" || current.trim() === "" ? change.text : `${current.trimEnd()}${APPEND_SEPARATOR}${change.text}`;
    next = { ...next, [change.field]: applied };
  }
  return next;
}
