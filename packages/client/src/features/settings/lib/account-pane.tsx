// The Account settings pane (client-architecture-lockdown.md §8) — DECLARED-PLANNED (unbuilt, O1's arm).

import { CircleUser } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

export const accountPane: SettingsPaneDefinition = {
  id: "account",
  group: "user",
  label: "Account",
  icon: CircleUser,
  description: "Your identity and sign-out land here when auth is wired.",
  body: { placeholder: true },
};
