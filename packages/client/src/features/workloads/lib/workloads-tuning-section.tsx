// The Workloads-tuning settings-SECTION CONTRIBUTION (Phase B ⑤ / client-architecture-lockdown.md §6c) — the
// co-located def workloads exports on its front door; main.tsx assembles it into the workloads pane's
// settings-section registry (G8) at the `workloads` anchor. features/workloads owns it (its own pane — the
// stint-2 truer-owner test).

import type { SettingsSectionContribution } from "#state";
import { WorkloadsTuningSection } from "../components/workloads-tuning-section";
import { WORKLOADS_TUNING_SUBCATEGORY } from "./workloads-tuning-nav";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "workloads-tuning";

export const workloadsTuningSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "workloads",
  nav: WORKLOADS_TUNING_SUBCATEGORY,
  owns: { tier: "user", section: "workloads", keys: ["dupThreshold", "computeThemesK", "maxPairs", "hubFraction"] },
  body: () => <WorkloadsTuningSection sectionId={SECTION_ID} />,
};
