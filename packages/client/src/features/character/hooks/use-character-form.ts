// The character-card editor form (FINAL-Character §6.5 · UI-Primitives §13.4 — "Character card editor →
// `createSavedEntityForm`"). A BUTTON-GATED editor over the DRAFT card-content fields (the immediate-commit
// identity fields ride their own patches outside this form, §2). The surface supplies `save` at CALL time
// (it must close over the live tRPC client + the character id, neither reachable at module scope; the
// theme-editor precedent) and it RESOLVES to the saved row re-mapped to form values (obligation 3).
//
// This is the FOUNDING consumer of the optional `draft` crash-mirror (§13.4 obligation-5): the card fields
// carry long authored text, so a `createEntityDraftStore` is wired here — a crash/reload survives, and the
// factory promotes the surviving draft after mount as user-intent writes so the save-bar pill lights
// honestly. The store's name (`character-card-draft`) is registered in the persistence-boundary gate's
// DEVICE_LOCAL_REGISTRY (an unregistered persisted store is a RED build).

import { createSavedEntityForm } from "#forms";
import { createEntityDraftStore } from "#state";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { DEFAULT_CHARACTER_CARD_FORM } from "../lib/character-card-form-model";

/** The per-character card-editor DRAFT mirror (device-local crash-survival; §13.4 obligation-5). */
export const characterCardDraftStore = createEntityDraftStore<CharacterCardFormValues>({
  name: "character-card-draft",
});

export const useCharacterForm = createSavedEntityForm<CharacterCardFormValues>({
  defaultValues: DEFAULT_CHARACTER_CARD_FORM,
  draft: characterCardDraftStore,
});
