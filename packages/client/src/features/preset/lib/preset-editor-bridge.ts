// THE FORM BRIDGE (BUILD-SPEC §2.3) — ⚠ the ONE net-new piece of machinery in the whole Assembly build.
// A hand-rolled module-scope external store that publishes the live preset EDITOR form handle so a
// SIBLING shell region can subscribe to it.
//
// Why it exists: CONTENT (the rack, which owns the form) and CONTEXT (the section inspector) are sibling
// shell regions with no shared React ancestor below the route, so lexical form context cannot cross the
// boundary. TanStack Form instances ARE external stores, so publishing the live handle lets the inspector
// bind fields (`form.AppField name="sections[i].name"`) from outside the form's provider tree. The route
// mounts both; the editor PUBLISHES on mount (keyed to its `mountKey` remount) and CLEARS on unmount, and
// the inspector SUBSCRIBES via `useAssemblyForm()`.
//
// GUARDS (the reason this is the highest-risk piece): a section id can go stale (delete / undo) while the
// inspector still holds it, and the published preset can differ from the LIST-selected preset mid-swap.
// `resolveAssemblySection` gates on all three conditions and returns `null` cleanly — the inspector then
// renders its EmptyState, never a throw.

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

/**
 * Publish the live form handle — called from the editor's mount effect (keyed to its `mountKey`
 * remount, so a save/reset cycle republishes the fresh instance). Replaces any prior handle.
 */
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

/**
 * Reactive: the currently-published handle (`null` = no editor mounted). The inspector's subscription —
 * `useSyncExternalStore` so a publish/clear tears the tree free.
 */
export function useAssemblyForm(): AssemblyFormHandle | null {
  // getServerSnapshot === getSnapshot: the module singleton is identical on server + client (no DOM
  // read), so one snapshot fn serves both and SSR/hydration can't tear.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The stale-handle GUARD (BUILD-SPEC §2.3) — resolve the section the inspector should render, or `null`.
 * Returns a section ONLY when ALL hold:
 *   1. a handle is published (`handle !== null`),
 *   2. the published preset matches the LIST-selected preset (`presetId` match — no mid-swap mismatch),
 *   3. `sectionId` resolves against the form's live `sections` (a stale id after delete/undo ⇒ `null`).
 * The inspector renders its EmptyState on any `null` — never a throw.
 */
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
