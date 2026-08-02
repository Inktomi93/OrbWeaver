// The settings-SECTION registry as a React CONTEXT (SET-SEAMS §5.2) — ONE registry for every anchor,
// replacing the four per-anchor registries that were threaded into `make*Pane(…)` factories and down into
// each surface by prop. The context/hook/provider trio is the `createRegistryContext` mint (G26); this file
// binds it to the settings-section vocabulary. Assembled ONCE at the door (main.tsx, G8), read by the
// settings host (nav + search) and by each host pane's surface (render, at the position IT owns).

import type { ContributorRegistry } from "#lib";
import { createRegistryContext } from "#lib";
import type { ResolvedSettingsSection, SettingsSectionContribution, SettingsViewerView } from "./settings-pane-registry";
import { resolveSettingsSections } from "./settings-pane-registry";
import type { SettingsCategoryId } from "./shell-store";

/** The open contributor view over every settings section, keyed by contribution id. */
export type SettingsSectionRegistry = ContributorRegistry<SettingsSectionContribution>;

export const settingsSectionRegistryContext = createRegistryContext<SettingsSectionRegistry>("settings-section registry");

export function useSettingsSectionRegistry(): SettingsSectionRegistry {
  return settingsSectionRegistryContext.useRegistry();
}

/** The visible sections contributed at one anchor — the render half of the seam, read by the host pane's
 *  own surface so a contributed section keeps the exact DOM position (and therefore the exact geometry) it
 *  had when the registry arrived by prop. `viewer` comes from `#data`'s `useSettingsViewerView()`, the ONE
 *  home of the projection a `when` predicate consumes. */
export function useSettingsSections(anchor: SettingsCategoryId, viewer: SettingsViewerView): readonly ResolvedSettingsSection[] {
  const registry = useSettingsSectionRegistry();
  return resolveSettingsSections(registry, anchor, viewer);
}
