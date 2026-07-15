// The Automation settings pane (client-architecture-lockdown.md §8) — DECLARED-PLANNED (unbuilt, O1's arm).

import { Zap } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

export const automationPane: SettingsPaneDefinition = {
  id: "automation",
  group: "app",
  label: "Automation",
  icon: Zap,
  description: "Scheduled and triggered actions across your library.",
  body: { placeholder: true },
};
