// The Personas config group (client-architecture-lockdown.md §8 · config-revamp-design.md §3.1/§6.8) — the
// persona surface RELOCATED into the unified Configuration workspace as a `sections` SKIMMER on the user
// shelf. Owned by features/persona (the M6.2 de-god move). PERSONA IS OWNER-SACRED: the surface moves and
// its FRAME conforms to the registry (three contributed sections — `persona-*-section.tsx` beside this
// file — with the editor and the pinned row as their search leaves, §6.8.2); its editing model, verbs and
// copy do not change here (S4 owns the rail slot).

import { Drama } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const personasGroup: ConfigGroupDefinition = {
  id: "personas",
  shelf: "user",
  label: "Personas",
  icon: Drama,
  description: "Your personas — create, edit, import and export — plus the persona-change notification.",
  order: 10,
  body: { kind: "sections" },
};
