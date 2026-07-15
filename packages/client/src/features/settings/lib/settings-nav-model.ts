// settings-nav-model — host-presentation residue: the nav group labels + the anchor-id derivation. The
// category-id tuple + SettingsPaneDefinition + SettingsSubcategory moved to `state/settings-pane-registry.ts`
// (M6.1 ruling, client-architecture-lockdown.md §5 rule 5 / §8) — this file keeps only what the settings
// HOST presents, not the pane vocabulary itself.

import type { SettingsCategoryId, SettingsGroup } from "#state";

/** The human label for each group's micro-caps nav heading. */
export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  user: "User",
  app: "App",
};

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered string literal. */
export function settingsAnchorId(categoryId: SettingsCategoryId, subId: string): string {
  return `settings-anchor-${categoryId}-${subId}`;
}
