// A hand-rolled module-scope external store that publishes the live character editor form handle so a
// sibling shell region (the Field inspector) can subscribe to it, mirroring preset-editor-bridge.ts.
// The only stale condition is a mid-swap mismatch (no facet-id staleness — the facet set is a static
// registry, unlike a preset section id); `resolveCharacterForm` gates on handle-present + id-match.

import type { CharacterId } from "@orb/kit/ids";
import { useSyncExternalStore } from "react";
import type { AppFormInstance } from "#forms";
import type { CharacterCardFormValues } from "./character-card-form-model";

/** The live handle the editor publishes: which character is open + its bound draft-card form instance. */
export interface CharacterFormHandle {
  readonly characterId: CharacterId;
  readonly form: AppFormInstance<CharacterCardFormValues>;
}

// Module singleton — one editor is mounted at a time (the route swaps CONTENT to a single
// `CharacterEditorSurface`), so a single published handle is the whole store.
let handle: CharacterFormHandle | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Publish the live form handle — called from the editor's mount effect. Replaces any prior handle. */
export function publishCharacterForm(next: CharacterFormHandle): void {
  handle = next;
  emit();
}

/** Clear the handle — the editor's unmount cleanup. The inspector's subscribers then see `null`. */
export function clearCharacterForm(): void {
  handle = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CharacterFormHandle | null {
  return handle;
}

/** Reactive: the currently-published handle (`null` = no editor mounted). */
export function useCharacterForm(): CharacterFormHandle | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Resolve the form the inspector should bind, or `null` when unpublished or id-mismatched. */
export function resolveCharacterForm(
  currentHandle: CharacterFormHandle | null,
  expectedCharacterId: CharacterId | null,
): CharacterFormHandle | null {
  if (currentHandle === null || expectedCharacterId === null) {
    return null;
  }
  if (currentHandle.characterId !== expectedCharacterId) {
    return null;
  }
  return currentHandle;
}
