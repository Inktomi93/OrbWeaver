// THE CHARACTER FORM BRIDGE (character-editor redesign — a near-verbatim copy of preset-editor-bridge.ts).
// A hand-rolled module-scope external store that publishes the live character EDITOR form handle so a
// SIBLING shell region can subscribe to it.
//
// Why it exists: CONTENT (the facet list + drill-in, which owns the draft card form) and CONTEXT (the Field
// inspector) are sibling shell regions with no shared React ancestor below the route, so lexical form
// context cannot cross the boundary. TanStack Form instances ARE external stores, so publishing the live
// handle lets the inspector bind fields (`form.AppField name="depthPromptDepth"`) from outside the form's
// provider tree. The route mounts both; the editor PUBLISHES on mount (keyed to its `mountKey` remount) and
// CLEARS on unmount, and the inspector SUBSCRIBES via `useCharacterForm()`.
//
// GUARD (SIMPLER than preset's): a preset SECTION id can go stale (delete/undo). A character FACET id
// CANNOT — the facet set is a static registry (character-card-facets.ts), no add/remove. So the only stale
// condition is a mid-swap mismatch: the published character differs from the LIST-selected character while
// the surface remounts. `resolveCharacterForm` gates on handle-present + id-match and returns `null` cleanly
// — the inspector then renders its EmptyState, never a throw.

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

/**
 * Publish the live form handle — called from the editor's mount effect (keyed to its `mountKey` remount, so
 * a save/reset cycle republishes the fresh instance). Replaces any prior handle.
 */
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

/**
 * Reactive: the currently-published handle (`null` = no editor mounted). The inspector's subscription —
 * `useSyncExternalStore` so a publish/clear tears the tree free.
 */
export function useCharacterForm(): CharacterFormHandle | null {
  // getServerSnapshot === getSnapshot: the module singleton is identical on server + client (no DOM read),
  // so one snapshot fn serves both and SSR/hydration can't tear.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The GUARD — resolve the form the inspector should bind, or `null`. Returns the handle ONLY when both hold:
 *   1. a handle is published (`handle !== null`),
 *   2. the published character matches the LIST-selected character (`characterId` match — no mid-swap
 *      mismatch).
 * The inspector renders its EmptyState on any `null` — never a throw. (No facet-id staleness check: the
 * facet set is a static registry, unlike a preset section id.)
 */
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
