// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Gauge + LucideIcon fine (the
// settings-nav.ts precedent).

// The Workloads settings category's nav DATA (the background-jobs + recurring-schedules panes) — split out
// of settings-nav.ts to keep that registry under the §2.1 component-size cap (the backup-nav.ts precedent).
// Same registry-as-data + one-home discipline as the sibling categories; imported back into
// `SETTINGS_CATEGORIES` (settings-nav.ts). The SHAPE vocabulary lives in settings-nav-model.ts.

import { Gauge } from "@orb/ui/icons";
import type { SettingsCategory } from "./settings-nav-model";

/** Workloads pane subcategory ids (the two anchored sections — the surface stamps each `<Section>` with
 *  `settingsAnchorId("workloads", id)`). */
export const WORKLOADS_SUBCATEGORY_IDS = { jobs: "jobs", schedules: "schedules" } as const;

/** The Workloads category (USER group — a user runs + schedules background jobs over their OWN library;
 *  the verbs are owner-scoped server-side). */
export const WORKLOADS_CATEGORY: SettingsCategory = {
  group: "user",
  label: "Workloads",
  icon: Gauge,
  description: "Run and monitor background jobs over your library.",
  built: true,
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
      keywords: [
        "schedule",
        "recurring",
        "cron",
        "cadence",
        "nightly",
        "daily",
        "weekly",
        "automatic",
        "edit",
        "bulk",
        "maintenance",
      ],
      settings: [
        {
          id: "create-schedule",
          label: "Create a schedule",
          keywords: [
            "recurring",
            "cadence",
            "nightly",
            "hourly",
            "weekly",
            "monthly",
            "automatic",
            "edit",
            "bulk",
            "system-wide",
            "maintenance",
          ],
        },
      ],
    },
  ],
};
