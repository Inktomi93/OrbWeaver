// The persona LIST config-section CONTRIBUTION — the `your-personas`
// section of the Personas group: the same list the rail popover and the You sheet render, anchored for the
// LIST, the spy and the search. No `owns` claim: the list drives the persona verbs and the `seeds` identity
// pointers (Set current / Set default) — the "CRUD surface like personas" exemption the partition header
// names, not a settings knob. The EDITOR is this section's search leaf (fork F-14).

import type { ConfigSectionContribution } from "#state";
import { PersonaListSection } from "../components/persona-list-section.tsx";
import { PERSONA_LIST_SUBCATEGORY } from "./personas-nav.ts";

export const personaListSection: ConfigSectionContribution = {
  id: "persona-list",
  anchor: "personas",
  nav: PERSONA_LIST_SUBCATEGORY,
  body: () => <PersonaListSection />,
};
