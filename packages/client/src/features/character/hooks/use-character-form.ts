// The character-card editor form — a button-gated editor over the draft card-content fields (the
// immediate-commit identity fields ride their own patches outside this form). Wires a
// `createEntityDraftStore` crash-mirror: the card fields carry long authored text, so a crash/reload
// survives and the factory promotes the surviving draft as user-intent writes.

import { createSavedEntityForm } from "#forms";
import { createEntityDraftStore } from "#state";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { DEFAULT_CHARACTER_CARD_FORM } from "../lib/character-card-form-model";

/** The per-character card-editor DRAFT mirror (device-local crash-survival; §13.4 obligation-5). */
const characterCardDraftStore = createEntityDraftStore<CharacterCardFormValues>({
  name: "character-card-draft",
});

export const useCharacterForm = createSavedEntityForm<CharacterCardFormValues>({
  defaultValues: DEFAULT_CHARACTER_CARD_FORM,
  draft: characterCardDraftStore,
});
