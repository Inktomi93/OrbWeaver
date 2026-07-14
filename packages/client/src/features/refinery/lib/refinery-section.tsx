// The Refinery rail section — the founding DECLARED-PLANNED member (client-architecture-lockdown.md §6a,
// ratified O1). No feature surface exists yet; `content: { planned }` is the same field a real build would
// occupy, so shipping the section forces deleting this marker in the same edit — no stale exemption.

import { FlaskConical } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";

export const refinerySection: SectionDefinition = {
  id: "refinery",
  rail: { label: "Refinery", icon: FlaskConical, group: "authoring" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: {
    title: "Refinery",
    description: "Score → rewrite → analyze a character card without drifting from your original.",
  },
  content: {
    planned: "refinery design set parked in proposed/ — owner keeps the section; build pending",
  },
  context: { kind: "none" },
};
