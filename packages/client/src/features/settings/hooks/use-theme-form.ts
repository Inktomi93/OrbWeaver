// The theme-EDITOR form (D44 §12.1 · §13.4 — "D44 theme editor → `createSavedEntityForm`"). A
// BUTTON-GATED editor over an OWNED `themes` row: the surface's Save button calls `form.handleSubmit()`,
// which runs `save` = the `updateTheme` mutation (supplied at CALL time — the theme-editor.tsx seam —
// since it must close over the live tRPC client + the row id, neither reachable at this module scope;
// mirrors the appearance pane's identical call-time seam on the autosave factory). The live
// `<ThemeScope>` PREVIEW (theme-editor.tsx) reads the form's current UNSAVED values, so editing previews
// live; only a deliberate Save persists — editing never touches the real app until then. That scoped
// preview is what makes button-gated save un-brickable (no autosave-of-a-bad-palette risk to begin
// with), so there is no un-brickability reason to autosave.

import { createSavedEntityForm } from "#forms";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM } from "../lib/theme-editor-model.ts";

export const useThemeForm = createSavedEntityForm<ThemeFormValues>({
  defaultValues: DEFAULT_THEME_FORM,
});
