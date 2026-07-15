// settings-nav-model — host-presentation residue: the nav group labels. The category-id tuple +
// SettingsPaneDefinition + SettingsSubcategory + settingsAnchorId moved to `state/settings-pane-registry.ts`
// (M6.1/M6.2 ruling, client-architecture-lockdown.md §5 rule 5 / §8) — this file keeps only what the
// settings HOST presents, not the pane vocabulary itself.

import type { SettingsGroup } from "#state";

/** The human label for each group's micro-caps nav heading. */
export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  user: "User",
  app: "App",
};
