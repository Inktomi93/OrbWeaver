// The live character-editor form bridge — a thin typed instantiation of the shared createFormHandleBridge
// (the module-scope external store) so a sibling shell region (the Field inspector) can subscribe to the
// editor's form handle. The only stale condition is a mid-swap mismatch (no facet-id staleness — the facet
// set is a static registry, unlike a preset section id); `resolveCharacterForm` gates on present + id-match.

import type { CharacterId } from "@orb/kit/ids";
import { createFormHandleBridge } from "#forms";
import type { AppFormInstance } from "#forms/editor";
import type { CharacterCardFormValues } from "./character-card-form-model.ts";

/** The live handle the editor publishes: which character is open + its bound draft-card form instance. */
export interface CharacterFormHandle {
  readonly characterId: CharacterId;
  readonly form: AppFormInstance<CharacterCardFormValues>;
}

const bridge = createFormHandleBridge<CharacterFormHandle>();

/** Publish the live form handle — called from the editor's mount effect. Replaces any prior handle. */
export const publishCharacterForm = bridge.publish;

/** Clear the handle — the editor's unmount cleanup. The inspector's subscribers then see `null`. */
export const clearCharacterForm = bridge.clear;

/** Reactive: the currently-published handle (`null` = no editor mounted). */
export const useCharacterForm = bridge.useHandle;

/** Resolve the form the inspector should bind, or `null` when unpublished or id-mismatched. */
export function resolveCharacterForm(currentHandle: CharacterFormHandle | null, expectedCharacterId: CharacterId | null): CharacterFormHandle | null {
  if (currentHandle === null || expectedCharacterId === null) {
    return null;
  }
  if (currentHandle.characterId !== expectedCharacterId) {
    return null;
  }
  return currentHandle;
}
