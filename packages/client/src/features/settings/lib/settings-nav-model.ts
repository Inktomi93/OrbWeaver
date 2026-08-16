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

/** The DOM id of a group's kicker — the one home for both ends of the nav group's `aria-labelledby` wiring
 *  (side-eye 2026-08-16 ARIA rider: the kickers were bare paragraphs, so the settings nav announced one
 *  flat run of rows). Derived from the group id rather than `useId` because the settings nav is a SINGLETON
 *  surface: a stable, readable id is what a `--aria`/CT receipt can name. */
export function settingsGroupLabelId(group: SettingsGroup): string {
  return `settings-nav-group-${group}`;
}
