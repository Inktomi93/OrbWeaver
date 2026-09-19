// The Automation config group (client-architecture-lockdown.md §8 · config-revamp-design.md §6.8) — the
// OWNER-GLOBAL rules surface as a `sections` SKIMMER on the app shelf.
//
// It was `{ placeholder: true }`, the DECLARED-PLANNED arm, and its own header said what it was waiting for:
// "this one becomes the OWNER-GLOBAL rules surface when C5's global lane lands". C5 landed, so it is that
// surface — list + picker + the owner rate ceiling (interaction-direction-spec §7 C5), as the two
// contributions beside this file (`automation-library-rules-section.tsx` · `automation-budget-section.tsx`).
// A group belongs to the feature whose surface it is, which is why this definition lives in
// `features/automation` and not in `features/config` (the config HOST, which owns no group of its own).

import { Zap } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const automationGroup: ConfigGroupDefinition = {
  id: "automation",
  shelf: "app",
  label: "Automation",
  icon: Zap,
  // The group's own teaching line — for search and for the welcome; it says what the group is FOR in the
  // host's own words, and it no longer has to point at a neighbouring feature as a "meanwhile".
  description: "Rules that watch your whole library and act on their own — no chat has to be open. Per-chat rules live in that chat's own settings.",
  body: { kind: "sections" },
};
