// The AUTOMATION doorway — the honest face of "future stuff" (home-section-spec §3.5, owner decision H9).
//
// Home ships NO "more coming" placeholder card: the posture is mechanical, not decorative — a new tile is
// one co-located file in the owning feature plus one array member at the door, and home is never edited.
// What a doorway is for is future stuff that is REAL: `automation.stream` already exists as a SANCTIONED-
// DORMANT channel through the SSE multiplex (stage 4) — "not a WIRE item, not deleted". This tile is the
// UI half of that posture, and it disappears by construction the day the chips consume the channel.

import { Zap } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";

const AUTOMATION_TILE_ORDER = 90;

export const automationDormantTile: HomeTileContribution = {
  id: "automation",
  title: "Automation",
  icon: Zap,
  order: AUTOMATION_TILE_ORDER,
  body: {
    dormant: {
      reason: "automation.stream through the SSE multiplex (stage 4 — a sanctioned doorway, not a stub)",
      teaser: "Rules that fire on your rooms — quick-reply chips, the fire log, and the budget panel, live over the rooms socket.",
    },
  },
};
