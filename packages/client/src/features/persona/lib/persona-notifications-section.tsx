// The persona NOTIFICATIONS config-section CONTRIBUTION — the co-located
// def features/persona exports on its front door; the door assembles it into the ONE config-section
// registry at the `personas` anchor. Claims the `persona` namespace's ONE key (SET-SEAMS §2.3), so the
// partition covers it and the S2 `@modified` derivation can read it.

import type { ConfigSectionContribution } from "#state";
import { PersonaNotificationsSection } from "../components/persona-notifications-section.tsx";
import { PERSONA_NOTIFICATIONS_SUBCATEGORY } from "./personas-nav.ts";

export const personaNotificationsSection: ConfigSectionContribution = {
  id: "persona-notifications",
  anchor: "personas",
  nav: PERSONA_NOTIFICATIONS_SUBCATEGORY,
  owns: { tier: "user", section: "persona", keys: ["showNotifications"] },
  body: () => <PersonaNotificationsSection />,
};
