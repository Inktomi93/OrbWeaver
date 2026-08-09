// The Jobs settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS stage
// 3: `body: { kind: "sections" }`, no own surface and no own `subcategories`. Both groups it used to render
// inside one pane surface are self-owned settings-SECTION CONTRIBUTIONS in this same feature now (§6,
// reader-owns — features/workloads owns the engine): jobs (the run/monitor list) and schedules (the
// recurring cadences), joining the analysis-tuning section that was already a contribution. The settings
// host renders the `workloads`-anchored contributions and DERIVES the pane's nav from them.

import { Gauge } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

/** The workloads pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx).
 *  USER-FACING VOCAB (owner 08-02): "workload" is the SYSTEM/code noun (the engine, the tables, the wire),
 *  never a word the user is shown — the PANE is "Jobs".
 *
 *  RULING FORK (side-eye 2026-08-08 P3). This comment used to read "the pane and its section both say
 *  'Jobs'", and the pane CT pinned that doubling as a precedent (Personas\>Personas, Tags\>Tags). Side-eye
 *  measured the consequence: two rows in the one `role="navigation"` landmark with the byte-identical
 *  accessible name "Jobs" and nothing to distinguish them. WCAG 2.5.3 (label-in-name) rules out an
 *  invisible `aria-label` qualifier, so the fix had to move visible copy — the first SECTION is "Runs" now
 *  (`workloads-jobs-nav.ts`). The ruling's MECHANISM is preserved intact: no user-facing surface says
 *  "workload", and the pane still says "Jobs". What is NOT preserved is the ruling's letter about the
 *  section's name, and the Personas\>Personas / Tags\>Tags instances of the same shape are untouched — they
 *  were outside the finding and outside this lane. */
export const workloadsPane: SettingsPaneDefinition = {
  id: "workloads",
  group: "user",
  label: "Jobs",
  icon: Gauge,
  description: "Run and monitor background jobs over your library.",
  body: { kind: "sections" },
};
