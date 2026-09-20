// The Connections MODEL-ROLES config-section CONTRIBUTION (config-revamp-design.md §6.8) — the group's
// second row. No `owns`: a role pick is a `connection_bindings` row written by `connection.setBinding`,
// not a settings-blob key (the `routing` section left the blob with the inference program, step 4).

import type { ConfigSectionContribution } from "#state";
import { ConnectionsRolesSection } from "../components/connections-roles-section.tsx";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsRolesSection: ConfigSectionContribution = {
  id: "connections-roles",
  anchor: "connections",
  nav: CONNECTIONS_ROLES_SUBCATEGORY,
  body: () => <ConnectionsRolesSection />,
};
