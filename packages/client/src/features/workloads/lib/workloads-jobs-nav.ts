// The Jobs section's nav entry (SET-SEAMS stage 3) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other
// (the workloads-tuning-nav precedent). The `(anchor, subId)` pair is byte-identical to the pre-split
// pane's own subcategory (§7.1), so every deep link and search leaf still lands.

import type { SettingsSubcategory } from "#state";

export const WORKLOADS_JOBS_SUBCATEGORY: SettingsSubcategory = {
  id: "jobs",
  // "Runs", not "Jobs" (side-eye 2026-08-08 P3, a RULING FORK — see the fork note in `workloads-pane.tsx`):
  // the pane is "Jobs" and this section used to be "Jobs" too, so the settings nav landmark carried two rows
  // with the byte-identical accessible name and nothing to tell them apart. WCAG 2.5.3 (label-in-name)
  // forbids papering that over with an `aria-label` the eye cannot see, so the VISIBLE name is what moves.
  // "Runs" is also the more descriptive name (2.4.6): this section lists RUNS, beside Schedules and Analysis
  // tuning. The `id` stays "jobs" — it is the anchor every deep link and search leaf resolves through.
  label: "Runs",
  // "jobs"/"workloads" stay SEARCH keywords (the old user-facing label + the system noun) so the section is
  // still findable by either — the rendered copy says "job" everywhere, never "workload" (owner 08-02).
  keywords: ["runs", "jobs", "workloads", "background", "queue", "tasks", "progress", "retry", "cancel"],
  settings: [
    {
      id: "run-workload",
      label: "Run a job",
      keywords: ["start", "embed", "import", "backfill", "themes", "duplicates", "bulk"],
    },
  ],
};
