// The Saved-rosters modal as ONE co-located definition (client-architecture-lockdown.md §6d) — the G23
// definition this feature OWNS. `surface` placement: it has no rail/topbar affordance of its own — it is
// opened by an explicit `openModal("savedRosters")` from the surfaces that own the intent (the new-chat
// picker's "Start from a saved roster" and the members panel's host action), the `addDocument`/`newChat` posture.
// The body suspends on the roster list + the open room's detail, so the boundary lives HERE (the
// production mount — the CT story law's counterpart) with a shape-matched skeleton.

import { Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { SkeletonRows } from "#data";
import type { ModalDefinition } from "#state";
import { RosterPicker } from "../components/roster-picker.tsx";

const SKELETON_ROW_COUNT = 4;

export const savedRostersModal: ModalDefinition = {
  id: "savedRosters",
  title: "Saved rosters",
  trigger: { placement: "surface", label: "Saved rosters", icon: Users },
  body: (): ReactElement => (
    <QueryBoundary fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />} reserveKey="rosterPreset.savedRosters">
      <RosterPicker />
    </QueryBoundary>
  ),
};
