// The About config group: a `sections` skimmer on the app shelf. UNGATED on purpose: every member can read
// and copy the install version for a bug report. The admin-only update check is a `when`-gated section at
// this anchor (`about-updates-section.tsx`), never a gate on the group.

import { Info } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const aboutGroup: ConfigGroupDefinition = {
  id: "about",
  shelf: "app",
  label: "About",
  icon: Info,
  description: "Which Orbweaver this install runs, ready to quote in a bug report.",
  body: { kind: "sections" },
};
