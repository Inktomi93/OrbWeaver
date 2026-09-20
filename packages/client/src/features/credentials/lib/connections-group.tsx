// The Connections config group (client-architecture-lockdown.md §8 · config-revamp-design.md §6.8) — a
// `sections` SKIMMER on the USER shelf (inference program §5.3a: every row is the member's own, so it sits
// beside Personas / Appearance / Chat behavior, not beside Automation and Admin). Its three rows are the
// contributions beside this file (connections · model roles · saved keys), assembled at the door in that
// order; the group itself declares nothing but its identity.

import { ExternalLink } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const connectionsGroup: ConfigGroupDefinition = {
  id: "connections",
  shelf: "user",
  label: "Connections",
  icon: ExternalLink,
  description: "Your providers, keys and models — and which one each role uses.",
  body: { kind: "sections" },
};
