// The EXTENSIONS section's drill selection (plugin-ui-plane #679 U5, §4.5b) — which registered `ui.page`
// surface the CONTENT pane is showing. Minted through the ONE sanctioned door (`createDrillSelectionStore`,
// G27) and homed centrally like every other per-section drill, so the section definition can publish its
// `SectionSelection` seam (the shell's mobile ONE-SHELL rule + its back affordance read it) without a feature
// owning shell-visible state.
//
// THE KEY IS `pluginId:surfaceId`, a composite string rather than a branded id, because a page is not an
// entity: it is a registration on a resident instance, identified by the pair. The two halves are joined and
// split HERE so the switcher, the content pane and any deep link all agree on one spelling — a second split in
// a component is exactly the drift this store exists to prevent. Neither half can contain a colon (a `PluginId`
// is a TypeID, a surface id is `/^[a-z][a-z0-9_]{0,40}$/`), so the join is unambiguous.
//
// A drill that names a page nobody registers any more resolves to nothing and the CONTENT pane shows its own
// empty — the durable-local referential-integrity posture (D138 rule 2: a dead reference never vetoes, never
// self-heals by writing). This store is ephemeral anyway (a page selection dies with the tab), so there is no
// persisted blob to sanitize.

import type { PluginId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

/** The composite drill key: `<pluginId>:<surfaceId>`. */
export type PluginPageKey = string;

/** Join the pair into the drill key — the ONE mint. */
export function pluginPageKey(pluginId: PluginId, surfaceId: string): PluginPageKey {
  return `${pluginId}:${surfaceId}`;
}

/** Split a drill key back into its pair, or `null` when it is not one (a stale/hand-written value). */
export function parsePluginPageKey(key: PluginPageKey): { readonly pluginId: PluginId; readonly surfaceId: string } | null {
  const at = key.indexOf(":");
  if (at <= 0 || at === key.length - 1) {
    return null;
  }
  return { pluginId: key.slice(0, at) as PluginId, surfaceId: key.slice(at + 1) };
}

const store = createDrillSelectionStore<PluginPageKey>("plugin-page-selection");

export const usePluginPageKey = store.usePrimaryId;
export const selectPluginPage = store.select;
export const selectPluginPageFromList = store.selectFromList;
export const clearPluginPage = store.clear;
/** The section-registry seam the SHELL reads (mobile list-as-screen + the back affordance). */
export const pluginPageSectionSelection = store.selection;
