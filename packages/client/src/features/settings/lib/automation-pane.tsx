// The Automation settings pane (client-architecture-lockdown.md §8) — DECLARED-PLANNED (unbuilt, O1's arm).

import { Zap } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

export const automationPane: SettingsPaneDefinition = {
  id: "automation",
  group: "app",
  label: "Automation",
  icon: Zap,
  // The "meanwhile" half of the honest empty state (side-eye 2026-08-06 P3): the pane's OWN copy is where a
  // placeholder points at the nearest thing that DOES exist — recurring runs are real today, under Jobs.
  description: "Scheduled and triggered actions across your library. Recurring runs already work — they live under Jobs → Schedules until this pane lands.",
  body: { placeholder: true },
};
