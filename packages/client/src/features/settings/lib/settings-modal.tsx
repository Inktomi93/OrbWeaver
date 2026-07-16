// The Settings modal as ONE co-located definition (client-architecture-lockdown.md §6d).

import { Settings } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { SettingsShell } from "../surfaces/settings-shell-surface";

export const settingsModal: ModalDefinition = {
  id: "settings",
  title: "Settings",
  size: "xl",
  trigger: { placement: "rail.end", label: "Settings", icon: Settings },
  body: (): ReturnType<typeof SettingsShell> => <SettingsShell />,
};
