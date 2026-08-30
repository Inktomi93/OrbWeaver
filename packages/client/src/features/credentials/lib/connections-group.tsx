// The Connections config group (client-architecture-lockdown.md §8 · config-revamp-design.md §6.8) — a
// `sections` SKIMMER on the app shelf. Owned by features/credentials — the M6.2 de-god move LANDED (§8/O3).
// Its three rows are the contributions beside this file (roles · host Claude · saved keys), assembled at
// the door in that order; the group itself declares nothing but its identity.

import { ExternalLink } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const connectionsGroup: ConfigGroupDefinition = {
  id: "connections",
  shelf: "app",
  label: "Connections",
  icon: ExternalLink,
  description: "Provider credentials and the per-role model connections.",
  body: { kind: "sections" },
};
