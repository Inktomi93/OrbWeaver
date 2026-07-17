// The per-character theme autosave form — the immediate-commit mechanism: no draft form, no Save button,
// no dirty pill; a debounced change persists the whole `themeOverride` blob. Mounted through the D78
// session boundary (`CharacterThemeForm`), which OWNS the characterId key: a character switch is a
// boundary-driven teardown/remount seeded from the new server override, so there is no manual `key` to
// place wrong (autosave-form-doctrine.md §1/§8, D78 L2). `save` is supplied at call time
// (character-appearance-tab.tsx). No `draft` mirror — a low-stakes tweak, not worth a crash-survival slot.

import { createAutosaveEntityForm } from "#forms";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model";
import { EMPTY_CHARACTER_THEME_FORM } from "../lib/character-theme-form-model";

const THEME_AUTOSAVE_DEBOUNCE_MS = 300;

export const CharacterThemeForm = createAutosaveEntityForm<CharacterThemeFormValues>({
  defaultValues: EMPTY_CHARACTER_THEME_FORM,
  debounceMs: THEME_AUTOSAVE_DEBOUNCE_MS,
});
