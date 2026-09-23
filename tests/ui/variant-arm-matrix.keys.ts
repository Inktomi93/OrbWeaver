// The ONE story-key vocabulary for the variant-arm matrix (design record: variant-arm-matrix.def.ts).
// Three modules speak it — def (population), stories (renderers), suite (dispatch) — and the compiler
// pins them: def keys are typed StoryKey, and the stories module's renderer table `satisfies
// Record<StoryKey, …>`, so a key added or dropped on one side is a tsc error, not a silent gap.
export const STORY_KEYS = [
  "badge",
  "button",
  "card",
  "checkbox",
  "empty-state",
  "highlighted-text",
  "input",
  "kbd",
  "list-row",
  "picker-cell",
  "select",
  "slider",
  "status-chip",
  "switch",
  "text",
  "toggle",
] as const;

export type StoryKey = (typeof STORY_KEYS)[number];

/** The theme environment axis — the three SHIPPED palettes (owner canon 2026-08-30: never a dark/light
 *  pair; a "both themes" receipt silently skips Mocha). Hearth IS the no-data-theme mount (#875 F2).
 *  Homed here (the pure vocabulary module) so the browser-side stories can type against it without
 *  pulling the def table. */
export const THEME_ARMS = ["hearth", "light", "mocha"] as const;
export type ThemeArm = (typeof THEME_ARMS)[number];
