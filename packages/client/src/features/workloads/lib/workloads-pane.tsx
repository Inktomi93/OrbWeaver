// The Jobs settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS stage
// 3: `body: { kind: "sections" }`, no own surface and no own `subcategories`. Both groups it used to render
// inside one pane surface are self-owned settings-SECTION CONTRIBUTIONS in this same feature now (§6,
// reader-owns — features/workloads owns the engine): jobs (the run/monitor list) and schedules (the
// recurring cadences), joining the analysis-tuning section that was already a contribution. The settings
// host renders the `workloads`-anchored contributions and DERIVES the pane's nav from them.

import { Gauge } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

/** The workloads pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx).
 *  USER-FACING VOCAB (owner 08-02): the pane and its section both say "Jobs" — "workload" is the
 *  SYSTEM/code noun (the engine, the tables, the wire), never a word the user is shown. */
export const workloadsPane: SettingsPaneDefinition = {
  id: "workloads",
  group: "user",
  label: "Jobs",
  icon: Gauge,
  description: "Run and monitor background jobs over your library.",
  body: { kind: "sections" },
};
