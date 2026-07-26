// The Workloads settings pane (client-architecture-lockdown.md §8) — a FACTORY over the `workloads`-anchored
// settings-section registry (Phase B ⑤): it merges each contributed section's nav into its subcategories and
// threads the registry into its surface, so the analysis-tuning knobs (the workloads feature's own tuning
// section) graft in via the seam rather than growing the pane inline (the makeAdminPane precedent, stint 2).

import { Gauge } from "@orb/ui/icons";
import type { ContributorRegistry } from "#lib";
import type { SettingsPaneDefinition, SettingsSectionContribution, SettingsSubcategory } from "#state";
import { settingsSectionNavs } from "#state";
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

/** The workloads pane is a host of the settings-section seam (Phase B ⑤). `sectionContributors` is the
 *  door-assembled `workloads`-anchored registry; the pane merges each contribution's `nav` into its
 *  subcategory list and threads the registry into its surface by prop. Zero contributions ⇒ identical to the
 *  pre-seam pane (the makeAdminPane precedent). */
export function makeWorkloadsPane(sectionContributors: ContributorRegistry<SettingsSectionContribution>): SettingsPaneDefinition {
  const contributedNavs = settingsSectionNavs(sectionContributors, "workloads");
  return {
    id: "workloads",
    group: "user",
    label: "Workloads",
    icon: Gauge,
    description: "Run and monitor background jobs over your library.",
    subcategories: [...OWN_SUBCATEGORIES, ...contributedNavs],
    body: () => <WorkloadsSettingsSurface sectionContributors={sectionContributors} />,
  };
}
