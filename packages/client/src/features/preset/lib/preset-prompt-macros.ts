// The macro catalog The Assembly's section templates + literal content complete against (the `{{ }}`
// trigger). Split into its own lib so the assembly view-model stays DOM-free (the `@orb/ui/macro-textarea`
// type surface drags browser TSX into the dom-less typecheck:graph — the persona/character precedent).
//
// A section template addresses the character (`{{char}}`), the persona (`{{user}}`/`{{persona}}`), and the
// per-marker payload macros the assembler resolves (`{{description}}`, `{{scenario}}`, …) — the same macros
// `DEFAULT_MARKER_TEMPLATES` uses. The list is a completion HINT (not an exhaustive registry); the field
// takes it as `suggestions` (ui imports no domain registry).

import type { MacroSuggestion } from "@orb/ui/macro-textarea";

/** The macro catalog a preset section (literal content + marker template) completes against. */
export const PRESET_PROMPT_MACROS: readonly MacroSuggestion[] = [
  { name: "char", category: "character", description: "The character's name" },
  { name: "user", category: "persona", description: "The active persona's name" },
  { name: "persona", category: "persona", description: "The persona's description" },
  { name: "description", category: "character", description: "The character's description" },
  { name: "personality", category: "character", description: "The character's personality" },
  { name: "scenario", category: "character", description: "The scene / setting" },
  { name: "example", category: "character", description: "The dialogue examples" },
];
