// The macro catalog every PROMPT-TEXT authoring field completes against (the `{{ }}` trigger). Homed in
// lib/ (not a feature) because it has two authoring homes now: the preset's sections/guided templates AND the
// GAME's own user macros (owner ruling #20's two definition homes) — a feature-local copy would be a sideways
// import from rpg into preset, and a second list would drift. Its own module so the assembly view-model stays
// DOM-free (the `@orb/ui/macro-textarea` type surface drags browser TSX into the dom-less typecheck:graph —
// the persona/character precedent).
//
// A prompt template addresses the character (`{{char}}`), the persona (`{{user}}`/`{{persona}}`), and the
// per-marker payload macros the assembler resolves (`{{description}}`, `{{scenario}}`, …) — the same macros
// `DEFAULT_MARKER_TEMPLATES` uses. The list is a completion HINT (not an exhaustive registry); the field
// takes it as `suggestions` (ui imports no domain registry).
//
// DELIBERATELY UNANNOTATED (no `: readonly MacroSuggestion[]`): this module rides the `#lib` barrel, which
// node-side `.ts` tests import — and `@orb/ui/macro-textarea` re-exports its type FROM the browser `.tsx`, so
// even a type-only import drags that component into the DOM-LESS type programs (`tsconfig.json` /
// `tsconfig.tests-dom.json`) and it fails there for want of lib.dom. The shape stays pinned where it is
// consumed: every call site hands this to a `suggestions` prop typed `readonly MacroSuggestion[]`, in a
// program that HAS dom.

/** The macro catalog a prompt-text field (preset section, guided template, user-macro body) completes against. */
export const PROMPT_MACRO_SUGGESTIONS = [
  { name: "char", category: "character", description: "The character's name" },
  { name: "user", category: "persona", description: "The active persona's name" },
  { name: "persona", category: "persona", description: "The persona's description" },
  { name: "description", category: "character", description: "The character's description" },
  { name: "personality", category: "character", description: "The character's personality" },
  { name: "scenario", category: "character", description: "The scene / setting" },
  { name: "example", category: "character", description: "The dialogue examples" },
];
