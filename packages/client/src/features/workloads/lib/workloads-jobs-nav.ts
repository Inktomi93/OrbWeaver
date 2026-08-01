// The Jobs section's nav entry (SET-SEAMS stage 3) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other
// (the workloads-tuning-nav precedent). The `(anchor, subId)` pair is byte-identical to the pre-split
// pane's own subcategory (§7.1), so every deep link and search leaf still lands.

import type { SettingsSubcategory } from "#state";

export const WORKLOADS_JOBS_SUBCATEGORY: SettingsSubcategory = {
  id: "jobs",
  label: "Jobs",
  keywords: ["jobs", "background", "queue", "tasks", "progress", "retry", "cancel"],
  settings: [
    {
      id: "run-workload",
      label: "Run a workload",
      keywords: ["start", "embed", "import", "backfill", "themes", "duplicates", "bulk"],
    },
  ],
};
