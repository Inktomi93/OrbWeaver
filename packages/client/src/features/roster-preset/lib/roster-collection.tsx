// The roster collection — B10's library-management surface, a Configuration-section
// `CollectionContribution` (the tag/regex/world-info door array; interaction-direction-spec.md B10:
// "library management: a Configuration-section CollectionContribution"). The rows scan the saved-roster
// library; the mounted member editor renames/describes/starts; authoring stays BY EXAMPLE through the
// saved-rosters modal (create opens that door — a from-scratch form would be a second composer for an
// artifact the room already composes).

import type { ReactElement } from "react";
import type { CollectionContribution, CollectionDetailView, CollectionListView } from "#lib";
import { RosterCollectionRows } from "../components/roster-collection-rows.tsx";
import { useCreateRosterMember, useRosterCount, useRosterMemberTitle } from "../hooks/use-roster-collection.ts";
import { RosterMemberSurface } from "../surfaces/roster-member-surface.tsx";

/** The collection KIND — the `rosterPreset` config group id (registry key + the selection store's kind axis). */
export const ROSTER_COLLECTION_ID = "rosterPreset";

function renderList(view: CollectionListView): ReactElement {
  return <RosterCollectionRows view={view} />;
}

function renderDetail(view: CollectionDetailView): ReactElement {
  return <RosterMemberSurface view={view} />;
}

export const rosterCollection: CollectionContribution = {
  emptyText: "No saved rosters yet.",
  useCount: useRosterCount,
  useMemberTitle: useRosterMemberTitle,
  create: { label: "New roster", useRun: useCreateRosterMember },
  list: renderList,
  detail: renderDetail,
  context: {
    kind: "none",
    title: "Nothing to attach",
    description: "A saved roster is a template — it attaches to nothing. Start a chat from it, or add it to a room you host, from the Members tab.",
  },
};
