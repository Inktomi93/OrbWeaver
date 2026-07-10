// The macro catalog a persona DESCRIPTION completes against. Split out of `persona-editor-model` so that
// model stays DOM-free (node-testable): the `@orb/ui/macro-textarea` type surface drags the MacroTextarea
// browser TSX into the dom-less typecheck:graph, and this presentation list is the only thing in the model
// that referenced it.

import type { MacroSuggestion } from "@orb/ui/macro-textarea";

/** The macro catalog a persona DESCRIPTION completes against (the `{{ }}` trigger). A persona
 *  description self-references with `{{user}}`/`{{persona}}` (both resolve to THIS persona at assemble
 *  time) and may reference `{{char}}`; the list is passed to the macro-aware textarea (ui imports none). */
export const PERSONA_DESCRIPTION_MACROS: readonly MacroSuggestion[] = [
  { name: "user", category: "persona", description: "This persona's name" },
  { name: "persona", category: "persona", description: "This persona's description" },
  { name: "char", category: "character", description: "The character's name" },
];
