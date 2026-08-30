// A group's LIST rows / search rows / spy anchors: the navs contributed at its anchor, in declared registry
// (= door = render) order — read ONCE off the one section registry by BOTH panes (the LIST paints them,
// CONTENT lands the first one on a group-only deep link). One derivation, so the two panes can never disagree
// about a group's rows, and NO group-owned half to merge: a group has no `subcategories` of its own
// (config-revamp-design.md §6.8 — every settings-shaped group is a skimmer by type).

import { useSettingsViewerView } from "#data";
import type { ConfigGroupDefinition, ConfigSubcategory } from "#state";
import { configSectionNavs, useConfigSectionRegistry } from "#state";

/** A resolver over the mounted section registry + the ONE `when` projection. Called at the top level of a
 *  pane; the returned function is pure over its inputs. */
export function useConfigSubcategories(): (group: ConfigGroupDefinition) => readonly ConfigSubcategory[] {
  const registry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  return (group: ConfigGroupDefinition): readonly ConfigSubcategory[] => configSectionNavs(registry, group.id, viewer);
}
