// The Refinery rail section — the founding DECLARED-PLANNED member (client-architecture-lockdown.md §6a,
// ratified O1). No feature surface exists yet; `content: { planned }` is the same field a real build would
// occupy, so shipping the section forces deleting this marker in the same edit — no stale exemption.

import { FlaskConical } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { NO_SELECTION_TITLE } from "#state";

export const refinerySection: SectionDefinition = {
  id: "refinery",
  rail: { label: "Refinery", icon: FlaskConical, group: "authoring", mobile: "sheet" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  // No member to name — the mobile topbar prints the section label (NO_SELECTION_TITLE).
  useSelectionTitle: NO_SELECTION_TITLE,
  placeholder: {
    title: "Refinery",
    description: "Score → rewrite → analyze a character card without drifting from your original.",
  },
  content: {
    planned: "refinery design set parked in proposed/ — owner keeps the section; build pending",
  },
  // Even a DECLARED-PLANNED section owes its pane a voice (side-eye F-12): the shared
  // "Details / Select something to see its details here." said nothing about the Refinery, and a
  // pane that reads as generically unfinished is indistinguishable from one that is broken.
  context: {
    kind: "none",
    empty: {
      title: "Refinery",
      description: "The scoring and rewrite readout lands with the Refinery surface itself — there is nothing to inspect yet.",
    },
  },
};
