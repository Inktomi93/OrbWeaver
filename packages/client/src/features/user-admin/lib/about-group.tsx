// The "This install" config group (id `about`): a `sections` skimmer on the app shelf. UNGATED on purpose:
// every member can read and copy the install version for a bug report. The admin-only update check is a
// `when`-gated section at this anchor (`about-section.tsx`), never a gate on the group. Not labelled "About":
// the CONTEXT pane's teacher tab already owns that name on this plane.

import { Info } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const aboutGroup: ConfigGroupDefinition = {
  id: "about",
  shelf: "app",
  label: "This install",
  icon: Info,
  description: "Which Orbweaver this install runs, ready to quote in a bug report.",
  body: { kind: "sections" },
};
