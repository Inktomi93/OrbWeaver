// The Connections MODEL-ROLES config-section CONTRIBUTION — the group's second row. A role's connection pick is a
// `connection_bindings` row written by `connection.setBinding`, not a settings key; the one settings key it owns
// is the Utility role's preset choice (D299).

import type { ConfigSectionContribution } from "#state";
import { ConnectionsRolesSection } from "../components/connections-roles-section.tsx";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsRolesSection: ConfigSectionContribution = {
  id: "connections-roles",
  anchor: "connections",
  nav: CONNECTIONS_ROLES_SUBCATEGORY,
  owns: { tier: "user", section: "seeds", keys: ["summarizePreset"] },
  body: () => <ConnectionsRolesSection />,
};
