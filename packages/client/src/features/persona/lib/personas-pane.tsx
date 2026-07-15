// The Personas settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Owned by features/persona (M6.2 de-god move, §8/O3).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Drama fine (the settings-nav.ts precedent).
import { Drama } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { PersonaSettingsSurface } from "../surfaces/persona-settings-surface";
import { PERSONA_SUBCATEGORY_IDS } from "./personas-nav";

export const personasPane: SettingsPaneDefinition = {
  id: "personas",
  group: "user",
  label: "Personas",
  icon: Drama,
  description: "Notifications + restore-from-backup. Edit personas from the rail-foot panel.",
  subcategories: [
    {
      id: PERSONA_SUBCATEGORY_IDS.personas,
      label: "Personas",
      settings: [
        {
          id: "persona-notifications",
          label: "Persona change notifications",
          keywords: ["notify", "notification", "alert"],
        },
        {
          id: "persona-restore",
          label: "Restore personas from a backup",
          keywords: ["import", "backup", "restore", "json"],
        },
      ],
    },
  ],
  body: () => <PersonaSettingsSurface />,
};
