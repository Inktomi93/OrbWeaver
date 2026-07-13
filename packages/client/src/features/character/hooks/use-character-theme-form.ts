// The per-character theme autosave form — the immediate-commit mechanism: no draft form, no Save button,
// no dirty pill; a debounced change persists the whole `themeOverride` blob. `save` is supplied at call
// time (character-appearance-tab.tsx). No `draft` mirror — a low-stakes tweak, not worth a crash-survival slot.

import { createAutosaveEntityForm } from "#forms";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model";
import { EMPTY_CHARACTER_THEME_FORM } from "../lib/character-theme-form-model";

const THEME_AUTOSAVE_DEBOUNCE_MS = 300;

export const useCharacterThemeForm = createAutosaveEntityForm<CharacterThemeFormValues>({
  defaultValues: EMPTY_CHARACTER_THEME_FORM,
  debounceMs: THEME_AUTOSAVE_DEBOUNCE_MS,
});
