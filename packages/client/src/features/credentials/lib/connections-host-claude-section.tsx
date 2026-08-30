// The Connections HOST-CLAUDE config-section CONTRIBUTION (config-revamp-design.md §6.8) — OWNER-gated
// through the one `when` the LIST, the search and the render all run (SET-SEAMS §5), so a non-owner never
// sees a row that scrolls to nothing. No `owns`: a probe verb, not a setting.

import type { ConfigSectionContribution } from "#state";
import { ConnectionsHostClaudeSection } from "../components/connections-host-claude-section.tsx";
import { CONNECTIONS_HOST_CLAUDE_SUBCATEGORY } from "./connections-nav.ts";

export const connectionsHostClaudeSection: ConfigSectionContribution = {
  id: "connections-host-claude",
  anchor: "connections",
  nav: CONNECTIONS_HOST_CLAUDE_SUBCATEGORY,
  when: (viewer) => viewer.isOwner,
  body: () => <ConnectionsHostClaudeSection />,
};
