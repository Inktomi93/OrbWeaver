// The EXTENSIONS section's drill selection — which registered `ui.page`
// surface the CONTENT pane is showing. Minted through the ONE sanctioned door (`createDrillSelectionStore`,
// G27) and homed centrally like every other per-section drill, so the section definition can publish its
// `SectionSelection` seam (the shell's mobile ONE-SHELL rule + its back affordance read it) without a feature
// owning shell-visible state.
//
// THE KEY IS `pluginId:surfaceId`, a composite string rather than a branded id, because a page is not an
// entity: it is a registration on a resident instance, identified by the pair. The key is opaque after the ONE
// mint below: selection and page resolution compare it exactly, and no route or persistence boundary parses it.
//
// A drill that names a page nobody registers any more resolves to nothing and the CONTENT pane shows its own
// empty — the durable-local referential-integrity posture (D138 rule 2: a dead reference never vetoes, never
// self-heals by writing). This store is ephemeral anyway (a page selection dies with the tab), so there is no
// persisted blob to sanitize.

import type { Branded, PluginId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

/** The composite drill key: `<pluginId>:<surfaceId>`. */
export type PluginPageKey = Branded<"PluginPageKey">;

/** Join the pair into the drill key — the ONE mint. */
export function pluginPageKey(pluginId: PluginId, surfaceId: string): PluginPageKey {
  return `${pluginId}:${surfaceId}` as PluginPageKey;
}

const store = createDrillSelectionStore<PluginPageKey>("plugin-page-selection");

export const usePluginPageKey = store.usePrimaryId;
export const selectPluginPageFromList = store.selectFromList;
export const clearPluginPage = store.clear;
/** The section-registry seam the SHELL reads (mobile list-as-screen + the back affordance). */
export const pluginPageSectionSelection = store.selection;
