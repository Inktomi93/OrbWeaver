// The Workloads settings pane (client-architecture-lockdown.md §8) — a HOST of the `workloads`-anchored
// settings-section seam (Phase B ⑤): the analysis-tuning knobs (the workloads feature's own tuning section)
// graft in via the seam rather than growing the pane inline, rendering inside its surface off the ONE
// door-assembled section registry while the settings shell merges their navs in.

import { Gauge } from "@orb/ui/icons";
import type { SettingsPaneDefinition, SettingsSubcategory } from "#state";
import { WorkloadsSettingsSurface } from "../surfaces/workloads-settings-surface";
import { WORKLOADS_SUBCATEGORY_IDS } from "./workloads-nav";

// The pane's OWN subcategories — the contributed section navs are appended after these (declared order).
const OWN_SUBCATEGORIES: readonly SettingsSubcategory[] = [
  {
    id: WORKLOADS_SUBCATEGORY_IDS.jobs,
    label: "Jobs",
    keywords: ["jobs", "background", "queue", "tasks", "progress", "retry", "cancel"],
    settings: [
      {
        id: "run-workload",
        label: "Run a workload",
        keywords: ["start", "embed", "import", "backfill", "themes", "duplicates", "bulk"],
      },
    ],
  },
  {
    id: WORKLOADS_SUBCATEGORY_IDS.schedules,
    label: "Schedules",
    keywords: ["schedule", "recurring", "cron", "cadence", "nightly", "daily", "weekly", "automatic", "edit", "bulk", "maintenance"],
    settings: [
      {
        id: "create-schedule",
        label: "Create a schedule",
        keywords: ["recurring", "cadence", "nightly", "hourly", "weekly", "monthly", "automatic", "edit", "bulk", "system-wide", "maintenance"],
      },
    ],
  },
];

/** The workloads pane — a host of the settings-section seam (Phase B ⑤). `subcategories` lists only what
 *  the pane itself renders; the shell appends the `workloads`-anchored contributions' navs. */
export const workloadsPane: SettingsPaneDefinition = {
  id: "workloads",
  group: "user",
  label: "Workloads",
  icon: Gauge,
  description: "Run and monitor background jobs over your library.",
  subcategories: OWN_SUBCATEGORIES,
  body: { kind: "surface", render: () => <WorkloadsSettingsSurface /> },
};
