// The character-card editor's crash-survival mirror (CRITICAL tier — 8 free-text prose fields + a
// greetings array; #73). Schema-version-gated only (no `validate`): `CharacterCardFormValues` is a
// plain flattened interface with no zod twin (the wire mapper lives in `character-card-form-model.ts`),
// so a stale-shape draft is caught by `schemaVersion` alone — bump it whenever the form's field set
// changes shape. Instantiated ONCE at module scope (the store THROWS on a duplicate `name`).

import { createEntityDraftStore } from "#state";
import type { CharacterCardFormValues } from "./character-card-form-model.ts";

export const characterDraftStore = createEntityDraftStore<CharacterCardFormValues>({
  name: "character-card",
  schemaVersion: 1,
});
