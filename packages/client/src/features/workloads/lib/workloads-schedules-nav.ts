// The Schedules section's nav entry (SET-SEAMS stage 3) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other.
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { SettingsSubcategory } from "#state";

export const WORKLOADS_SCHEDULES_SUBCATEGORY: SettingsSubcategory = {
  id: "schedules",
  label: "Schedules",
  keywords: ["schedule", "recurring", "cron", "cadence", "nightly", "daily", "weekly", "automatic", "edit", "bulk", "maintenance"],
  settings: [
    {
      id: "create-schedule",
      label: "Create a schedule",
      keywords: ["recurring", "cadence", "nightly", "hourly", "weekly", "monthly", "automatic", "edit", "bulk", "system-wide", "maintenance"],
    },
  ],
};
