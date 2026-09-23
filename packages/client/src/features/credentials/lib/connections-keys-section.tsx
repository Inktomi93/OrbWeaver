// The Connections SAVED-KEYS config-section CONTRIBUTION — the credential
// library as the group's last row. No `owns`: credential verbs, not settings.

import type { ConfigSectionContribution } from "#state";
import { ConnectionsKeysSection } from "../components/connections-keys-section.tsx";
import { CONNECTIONS_KEYS_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsKeysSection: ConfigSectionContribution = {
  id: "connections-keys",
  anchor: "connections",
  nav: CONNECTIONS_KEYS_SUBCATEGORY,
  body: () => <ConnectionsKeysSection />,
};
