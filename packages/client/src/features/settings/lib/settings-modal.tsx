// The Settings modal as ONE co-located definition (client-architecture-lockdown.md §6d).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the Settings glyph fine (the rail-slots precedent).
import { Settings } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { SettingsShell } from "../surfaces/settings-shell-surface";

export const settingsModal: ModalDefinition = {
  id: "settings",
  title: "Settings",
  size: "xl",
  trigger: { placement: "rail-footer", label: "Settings", icon: Settings },
  body: (): ReturnType<typeof SettingsShell> => <SettingsShell />,
};
