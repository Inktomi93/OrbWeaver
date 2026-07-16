// The live preset-editor form bridge — a thin typed instantiation of the shared createFormHandleBridge
// (the module-scope external store) so a sibling shell region can subscribe to it. Content (the rack, which
// owns the form) and Context (the section inspector) have no shared React ancestor below the route, so
// lexical form context can't cross the boundary — publishing the live handle lets the inspector bind fields
// from outside the form's provider tree. The editor publishes on mount and clears on unmount.
//
// A section id can go stale (delete/undo) while the inspector still holds it, and the published
// preset can differ from the list-selected preset mid-swap. `resolveAssemblySection` gates on all
// three conditions and returns `null` cleanly — the inspector renders its EmptyState, never a throw.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import type { AppFormInstance } from "#forms";
import { createFormHandleBridge } from "#forms";

/** The live handle the editor publishes: which preset is open + its bound form instance. */
export interface AssemblyFormHandle {
  readonly presetId: PresetId;
  readonly form: AppFormInstance<PromptConfig>;
}

const bridge = createFormHandleBridge<AssemblyFormHandle>();

/** Publish the live form handle — called from the editor's mount effect. Replaces any prior handle. */
export const publishAssemblyForm = bridge.publish;

/** Clear the handle — the editor's unmount cleanup. The inspector's subscribers then see `null`. */
export const clearAssemblyForm = bridge.clear;

/** Reactive: the currently-published handle (`null` = no editor mounted). */
export const useAssemblyForm = bridge.useHandle;

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
