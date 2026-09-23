// A group's LIST rows / search rows / spy anchors: the navs contributed at its anchor, in the ONE canonical
// order (`ConfigSectionPartition` — plain sections in declared registry order, then the advanced-fold
// cohort) — read off the one section registry by BOTH panes, so the map the LIST paints and the sequence
// CONTENT renders cannot disagree (side-eye 2026-09-02 F4). One derivation, and NO group-owned half to
// merge: a group has no `subcategories` of its own (every settings-shaped
// group is a skimmer by type).
//
// TWO projections of that one derivation, because the consumers ask different questions. The LIST asks
// WHERE a section lives (it draws the fold cohort as a named nested group, so a reader can see that
// "Effects" is behind a disclosure) and takes the PARTS; search, the palette and the group-only landing ask
// only for the sequence and take the FLAT list. Neither re-sorts.

import { useSettingsViewerView } from "#data";
import type { ConfigGroupDefinition, ConfigSectionPartition, ConfigSubcategory } from "#state";
import { configSectionNavParts, configSectionNavs, useConfigSectionRegistry } from "#state";

/** A resolver over the mounted section registry + the ONE `when` projection. Called at the top level of a
 *  pane; the returned function is pure over its inputs. */
export function useConfigSubcategories(): (group: ConfigGroupDefinition) => readonly ConfigSubcategory[] {
  const registry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  return (group: ConfigGroupDefinition): readonly ConfigSubcategory[] => configSectionNavs(registry, group.id, viewer);
}

/** The same derivation, keeping the fold split — for the LIST, which announces the cohort rather than
 *  quietly appending it. */
export function useConfigSubcategoryParts(): (group: ConfigGroupDefinition) => ConfigSectionPartition<ConfigSubcategory> {
  const registry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  return (group: ConfigGroupDefinition): ConfigSectionPartition<ConfigSubcategory> => configSectionNavParts(registry, group.id, viewer);
}
