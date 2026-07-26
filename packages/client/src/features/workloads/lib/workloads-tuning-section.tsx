// The Workloads-tuning settings-SECTION CONTRIBUTION (Phase B ⑤ / client-architecture-lockdown.md §6c) — the
// co-located def workloads exports on its front door; main.tsx assembles it into the workloads pane's
// settings-section registry (G8) at the `workloads` anchor. features/workloads owns it (its own pane — the
// stint-2 truer-owner test).

import type { SettingsSectionContribution } from "#state";
import { WorkloadsTuningSection } from "../components/workloads-tuning-section";
import { WORKLOADS_TUNING_SUBCATEGORY } from "./workloads-tuning-nav";

export const workloadsTuningSection: SettingsSectionContribution = {
  id: "workloads-tuning",
  anchor: "workloads",
  nav: WORKLOADS_TUNING_SUBCATEGORY,
  body: () => <WorkloadsTuningSection />,
};
