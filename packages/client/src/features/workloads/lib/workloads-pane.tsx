// The Workloads settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. TEMPORARY home (M6.1: panes stay put; the workloads-owned move is M6.2).

import { Gauge } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { WorkloadsSettingsSurface } from "../surfaces/workloads-settings-surface";
import { WORKLOADS_SUBCATEGORY_IDS } from "./workloads-nav";

export const workloadsPane: SettingsPaneDefinition = {
  id: "workloads",
  group: "user",
  label: "Workloads",
  icon: Gauge,
  description: "Run and monitor background jobs over your library.",
  subcategories: [
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
  ],
  body: () => <WorkloadsSettingsSurface />,
};
