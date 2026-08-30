// The Connections MODEL-ROLES config-section CONTRIBUTION (config-revamp-design.md §6.8) — the group's first
// row. Claims the `routing` namespace's ONE key (SET-SEAMS §2.3): the section autosaves `roleDefaults` and
// nothing else writes it, so the partition covers it and the S2 `@modified` derivation can read it.

import type { ConfigSectionContribution } from "#state";
import { ConnectionsRolesSection } from "../components/connections-roles-section.tsx";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsRolesSection: ConfigSectionContribution = {
  id: "connections-roles",
  anchor: "connections",
  nav: CONNECTIONS_ROLES_SUBCATEGORY,
  owns: { tier: "user", section: "routing", keys: ["roleDefaults"] },
  body: () => <ConnectionsRolesSection />,
};
