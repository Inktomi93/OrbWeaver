// The Schedules section's nav entry (SET-SEAMS stage 3) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other.
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { ConfigSubcategory } from "#state";

export const WORKLOADS_SCHEDULES_SUBCATEGORY: ConfigSubcategory = {
  id: "schedules",
  label: "Schedules",
  keywords: ["schedule", "recurring", "cron", "cadence", "nightly", "daily", "weekly", "automatic", "edit", "bulk", "maintenance"],
  teach: {
    summary: "Recurring job cadences: set a job to run nightly, hourly or weekly instead of triggering it by hand each time.",
    affects: ["your recurring background jobs"],
  },
  settings: [
    {
      id: "create-schedule",
      label: "Create a schedule",
      keywords: ["recurring", "cadence", "nightly", "hourly", "weekly", "monthly", "automatic", "edit", "bulk", "system-wide", "maintenance"],
      teach: { summary: "Run a job on a cadence \u2014 nightly, hourly, weekly \u2014 instead of by hand.", affects: ["your recurring background jobs"] },
    },
  ],
};
