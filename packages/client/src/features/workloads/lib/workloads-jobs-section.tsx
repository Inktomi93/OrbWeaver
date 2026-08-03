// The Jobs settings-SECTION CONTRIBUTION (SET-SEAMS stage 3) — the co-located def workloads exports on its
// front door; main.tsx assembles it into the ONE settings-section registry at the `workloads` anchor.
// features/workloads owns it (it owns the engine these rows are a face for).
//
// No `owns` claim: the section persists nothing through the settings tiers — it drives the `workloads.*`
// verbs (start/cancel/retry), so it is exempt from the §2.3 key partition.

import type { SettingsSectionContribution } from "#state";
import { WorkloadsJobsSection } from "../components/workloads-jobs-section.tsx";
import { WORKLOADS_JOBS_SUBCATEGORY } from "./workloads-jobs-nav.ts";

export const workloadsJobsSection: SettingsSectionContribution = {
  id: "workloads-jobs",
  anchor: "workloads",
  nav: WORKLOADS_JOBS_SUBCATEGORY,
  body: () => <WorkloadsJobsSection />,
};
