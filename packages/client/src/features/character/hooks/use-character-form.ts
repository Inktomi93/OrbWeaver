// The character-card editor AUTOSAVE form (§13.4 obligation-5 · D66 A4 · north-star §7). `save` closes
// over the live tRPC client + row id at the call site (character-editor-surface.tsx) — unreachable at
// this module scope — mirroring use-persona-form.ts.
//
// NO draft crash-mirror: on autosave the server row IS the mirror (a confirmed patch lands within the
// 500ms debounce), and the card form carries no validators, so there is no long-invalid window a mirror
// would guard — omitting it is the persona/appearance precedent (obligation-5). The former
// `createEntityDraftStore("character-card-draft")` and its persistence-boundary registry row are gone.
//
// The form is WIDENED back to the full AppFormInstance: the editor threads `form` into ~6 child
// components (several outside this slice) typed against AppFormInstance, and the autosave factory omits
// `reset` from its return TYPE only (the method still exists at runtime). Widening once here keeps the
// autosave conversion from rippling a type change into every consumer; reset MISUSE is caught by the
// no-form-reset-in-autosave gate, not the type (the feature has zero `.reset(` call sites).

import type { AppFormInstance, AutosaveEntityFormArgs, AutosaveSaveState } from "#forms";
import { createAutosaveEntityForm } from "#forms";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { DEFAULT_CHARACTER_CARD_FORM } from "../lib/character-card-form-model";

const useAutosaveCharacterForm = createAutosaveEntityForm<CharacterCardFormValues>({
  defaultValues: DEFAULT_CHARACTER_CARD_FORM,
});

export function useCharacterForm(args: AutosaveEntityFormArgs<CharacterCardFormValues>): {
  form: AppFormInstance<CharacterCardFormValues>;
  mountKey: string;
  saveState: AutosaveSaveState;
  retrySave: () => void;
} {
  const { form, mountKey, saveState, retrySave } = useAutosaveCharacterForm(args);
  return { form: form as AppFormInstance<CharacterCardFormValues>, mountKey, saveState, retrySave };
}
