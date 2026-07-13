// A hand-rolled module-scope external store that publishes the live preset editor form handle so a
// sibling shell region can subscribe to it. Content (the rack, which owns the form) and Context (the
// section inspector) have no shared React ancestor below the route, so lexical form context can't
// cross the boundary — publishing the live handle lets the inspector bind fields from outside the
// form's provider tree. The editor publishes on mount and clears on unmount.
//
// A section id can go stale (delete/undo) while the inspector still holds it, and the published
// preset can differ from the list-selected preset mid-swap. `resolveAssemblySection` gates on all
// three conditions and returns `null` cleanly — the inspector renders its EmptyState, never a throw.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { useSyncExternalStore } from "react";
import type { AppFormInstance } from "#forms";

/** The live handle the editor publishes: which preset is open + its bound form instance. */
export interface AssemblyFormHandle {
  readonly presetId: PresetId;
  readonly form: AppFormInstance<PromptConfig>;
}

// Module singleton — one editor is mounted at a time (the route swaps CONTENT to a single
// `PresetEditorSurface`), so a single published handle is the whole store.
let handle: AssemblyFormHandle | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Publish the live form handle — called from the editor's mount effect. Replaces any prior handle. */
export function publishAssemblyForm(next: AssemblyFormHandle): void {
  handle = next;
  emit();
}

/** Clear the handle — the editor's unmount cleanup. The inspector's subscribers then see `null`. */
export function clearAssemblyForm(): void {
  handle = null;
  emit();
}

/** Non-reactive snapshot of the current handle (the delete/guard code path + tests read it directly). */
export function readAssemblyForm(): AssemblyFormHandle | null {
  return handle;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AssemblyFormHandle | null {
  return handle;
}

/** Reactive: the currently-published handle (`null` = no editor mounted). */
export function useAssemblyForm(): AssemblyFormHandle | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Resolve the section the inspector should render, or `null` when the handle is unpublished, the
 *  preset mismatches the list-selected one, or the section id is stale. */
export function resolveAssemblySection(
  currentHandle: AssemblyFormHandle | null,
  expectedPresetId: PresetId | null,
  sectionId: string | null,
): PromptSection | null {
  if (currentHandle === null || expectedPresetId === null || sectionId === null) {
    return null;
  }
  if (currentHandle.presetId !== expectedPresetId) {
    return null;
  }
  const sections: readonly PromptSection[] = currentHandle.form.state.values.sections;
  return sections.find((section) => section.id === sectionId) ?? null;
}
