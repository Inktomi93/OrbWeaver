// The Saved-parties modal as ONE co-located definition (client-architecture-lockdown.md §6d) — the G23
// definition this feature OWNS. `surface` placement: it has no rail/topbar affordance of its own — it is
// opened by an explicit `openModal("savedParties")` from the surfaces that own the intent (the new-chat
// picker's "Start from party…" and the members panel's host action), the `addDocument`/`newChat` posture.
// The body suspends on the party list + the open room's detail, so the boundary lives HERE (the
// production mount — the CT story law's counterpart) with a shape-matched skeleton.

import { Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { QueryBoundary, SkeletonRows } from "#data";
import type { ModalDefinition } from "#state";
import { PartyPicker } from "../components/party-picker.tsx";

const SKELETON_ROW_COUNT = 4;

export const savedPartiesModal: ModalDefinition = {
  id: "savedParties",
  title: "Saved parties",
  trigger: { placement: "surface", label: "Saved parties", icon: Users },
  body: (): ReactElement => (
    <QueryBoundary fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}>
      <PartyPicker />
    </QueryBoundary>
  ),
};
