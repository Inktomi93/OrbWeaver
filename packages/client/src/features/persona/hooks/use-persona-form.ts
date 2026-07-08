// The persona-EDITOR form (§13.4 — button-gated `createSavedEntityForm`). A button-gated editor over an
// OWNED persona row: the surface's Save button runs `save` = the `persona.update` mutation, supplied at
// CALL time (the persona-editor.tsx seam — it closes over the live tRPC client + the row id, neither
// reachable at this module scope; mirrors the theme editor). The description preview reads the form's
// UNSAVED values live; only Save persists.

import { createSavedEntityForm } from "#forms";
import type { PersonaFormValues } from "../lib/persona-editor-model";
import { DEFAULT_PERSONA_FORM } from "../lib/persona-editor-model";

export const usePersonaForm = createSavedEntityForm<PersonaFormValues>({
  defaultValues: DEFAULT_PERSONA_FORM,
});
