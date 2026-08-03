// The Personas settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Owned by features/persona (M6.2 de-god move, §8/O3).

import { Drama } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { PersonaSettingsSurface } from "../surfaces/persona-settings-surface";
import { PERSONA_SUBCATEGORY_IDS } from "./personas-nav";

export const personasPane: SettingsPaneDefinition = {
  id: "personas",
  group: "user",
  label: "Personas",
  icon: Drama,
  description: "Persona notifications. Edit, import and export personas from the rail-foot panel.",
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
      ],
    },
  ],
  body: { kind: "surface", render: () => <PersonaSettingsSurface /> },
};
