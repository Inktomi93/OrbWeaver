// The config-SECTION registry as a React CONTEXT (SET-SEAMS §5.2) — ONE registry for every anchor,
// replacing the four per-anchor registries that were threaded into `make*Pane(…)` factories and down into
// each surface by prop. The context/hook/provider trio is the `createRegistryContext` mint (G26); this file
// binds it to the config-section vocabulary. Assembled ONCE at the door (compose/config-sections.ts, G8),
// read by the config host (LIST rows + search) and by each host group's surface (render, at the position
// IT owns).

import type { ContributorRegistry } from "#lib";
import { createRegistryContext } from "#lib";
import type { ConfigGroupId } from "./config-group-ids.ts";
import type { SettingsViewerView } from "./config-group-registry.ts";
import type { ConfigSectionContribution, ResolvedConfigSection } from "./config-section-registry.ts";
import { resolveConfigSections } from "./config-section-registry.ts";

/** The open contributor view over every config section, keyed by contribution id. */
export type ConfigSectionRegistry = ContributorRegistry<ConfigSectionContribution>;

export const configSectionRegistryContext = createRegistryContext<ConfigSectionRegistry>("config-section registry");

export function useConfigSectionRegistry(): ConfigSectionRegistry {
  return configSectionRegistryContext.useRegistry();
}

/** The visible sections contributed at one anchor — the render half of the seam, read by the host group's
 *  own surface so a contributed section keeps the exact DOM position (and therefore the exact geometry) it
 *  had when the registry arrived by prop. `viewer` comes from `#data`'s `useSettingsViewerView()`, the ONE
 *  home of the projection a `when` predicate consumes. */
export function useConfigSections(anchor: ConfigGroupId, viewer: SettingsViewerView): readonly ResolvedConfigSection[] {
  const registry = useConfigSectionRegistry();
  return resolveConfigSections(registry, anchor, viewer);
}
