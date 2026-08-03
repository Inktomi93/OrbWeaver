// The Schedules settings-SECTION CONTRIBUTION (SET-SEAMS stage 3) — the co-located def workloads exports
// on its front door; main.tsx assembles it into the ONE settings-section registry at the `workloads` anchor.
//
// No `owns` claim: the section persists nothing through the settings tiers — recurring schedules are rows
// behind the `workloads.*Schedule` verbs, so it is exempt from the §2.3 key partition.

import type { SettingsSectionContribution } from "#state";
import { SchedulesSection } from "../components/schedules-section.tsx";
import { WORKLOADS_SCHEDULES_SUBCATEGORY } from "./workloads-schedules-nav.ts";

export const workloadsSchedulesSection: SettingsSectionContribution = {
  id: "workloads-schedules",
  anchor: "workloads",
  nav: WORKLOADS_SCHEDULES_SUBCATEGORY,
  body: () => <SchedulesSection />,
};
