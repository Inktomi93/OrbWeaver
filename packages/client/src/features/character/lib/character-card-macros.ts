// The macro catalog a character card's free-text fields complete against (the `{{ }}` trigger). Split out
// of `character-card-form-model` so that model stays DOM-free (node-testable): the `@orb/ui/macro-textarea`
// type surface drags the MacroTextarea browser TSX into the dom-less typecheck:graph, and this
// presentation list is the only thing in the model that referenced it.

import type { MacroSuggestion } from "@orb/ui/macro-textarea";

/** The macro catalog card free-text completes against (the `{{ }}` trigger). Cards self-reference the
 *  character with `{{char}}` and the human with `{{user}}`; the list feeds the macro-aware textarea
 *  (ui imports no registry — the field takes `suggestions`). */
export const CHARACTER_CARD_MACROS: readonly MacroSuggestion[] = [
  { name: "char", category: "character", description: "This character's name" },
  { name: "user", category: "persona", description: "The active persona's name" },
];
