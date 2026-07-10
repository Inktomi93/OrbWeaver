// The per-character THEME autosave form (FINAL-Character §8.1 · D54 §13.4 — "≥3 fields OR save semantics →
// a factory"; `createAutosaveEntityForm` is the "flip it and it saves" editor). This is the IMMEDIATE-commit
// mechanism §8.1 asks for: no draft form, no Save button, no dirty pill, never the CONTENT save-bar (§2) —
// a debounced change persists the WHOLE `themeOverride` blob on its own. `save` is supplied at CALL time
// (character-appearance-tab.tsx) so it can close over the live `character.update` mutation + the id; the
// mount seed is the character's current override mapped to flat form values (`characterThemeFormFromOverride`).
//
// No `draft` mirror: a per-character token tweak is a low-stakes, sub-second-autosave surface, not a long
// unsaved composition worth a crash-survival slot (the factory permits omitting it).

import { createAutosaveEntityForm } from "#forms";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model";
import { EMPTY_CHARACTER_THEME_FORM } from "../lib/character-theme-form-model";

const THEME_AUTOSAVE_DEBOUNCE_MS = 300;

export const useCharacterThemeForm = createAutosaveEntityForm<CharacterThemeFormValues>({
  defaultValues: EMPTY_CHARACTER_THEME_FORM,
  debounceMs: THEME_AUTOSAVE_DEBOUNCE_MS,
});
