// The Personas settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Owned by features/persona (M6.2 de-god move, §8/O3).

import { Drama } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { PersonaSettingsSurface } from "../surfaces/persona-settings-surface";
import { PERSONA_SUBCATEGORY_IDS, PERSONA_SUBCATEGORY_LABEL } from "./personas-nav";

export const personasPane: SettingsPaneDefinition = {
  id: "personas",
  group: "user",
  label: "Personas",
  icon: Drama,
  description: "Your personas — create, edit, import and export — plus the persona-change notification.",
  subcategories: [
    {
      id: PERSONA_SUBCATEGORY_IDS.personas,
      label: PERSONA_SUBCATEGORY_LABEL,
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
