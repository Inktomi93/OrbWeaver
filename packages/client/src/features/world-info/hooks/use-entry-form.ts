// The world-info ENTRY editor form (a many-field editor → `createSavedEntityForm`, UI-Primitives §13.4).
// A BUTTON-GATED editor (Save + dirty pill — mirrors the preset editor, not the autosave persona panel):
// entries carry a required title + content (`min(1)`), so a save-on-every-keystroke would spam rejects on
// a half-typed field. The mount seed is `entryFormFromEntity(entry)`; on submit the surface's call-time
// `save` maps back via `entryUpdateInputFromForm` (closing over the entry's existing metadata for the
// unknown-key preservation) and re-baselines.

import { createSavedEntityForm } from "#forms";
import type { EntryFormValues } from "../lib/entry-editor-model";
import { NEW_ENTRY_FORM } from "../lib/entry-editor-model";

export const useEntryForm = createSavedEntityForm<EntryFormValues>({
  defaultValues: NEW_ENTRY_FORM,
});
