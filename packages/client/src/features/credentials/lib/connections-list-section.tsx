// The Connections LIST config-section CONTRIBUTION (inference program §5.3a) — the group's first row: the
// user's connection rows and the add flow. No `owns`: connection verbs, not settings.

import type { ConfigSectionContribution } from "#state";
import { ConnectionsListSection } from "../components/connections-list-section.tsx";
import { CONNECTIONS_LIST_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsListSection: ConfigSectionContribution = {
  id: "connections-list",
  anchor: "connections",
  nav: CONNECTIONS_LIST_SUBCATEGORY,
  body: () => <ConnectionsListSection />,
};
