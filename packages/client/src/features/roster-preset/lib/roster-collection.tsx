// The roster collection — B10's library-management surface, a Configuration-section
// `CollectionContribution` (the tag/regex/world-info door array B10:
// "library management: a Configuration-section CollectionContribution"). The rows scan the saved-roster
// library; the mounted member editor renames/describes/starts; authoring stays BY EXAMPLE through the
// saved-rosters modal (create opens that door — a from-scratch form would be a second composer for an
// artifact the room already composes).

import type { ReactElement } from "react";
import type { CollectionContribution, CollectionListView, CollectionMemberView } from "#lib";
import { RosterCollectionRows } from "../components/roster-collection-rows.tsx";
import { useCreateRosterMember, useRosterCount, useRosterInsights, useRosterMemberTitle } from "../hooks/use-roster-collection.ts";
import { RosterMemberSurface } from "../surfaces/roster-member-surface.tsx";

function renderList(view: CollectionListView): ReactElement {
  return <RosterCollectionRows view={view} />;
}

function renderDetail(view: CollectionMemberView): ReactElement {
  return <RosterMemberSurface view={view} />;
}

export const rosterCollection: CollectionContribution = {
  emptyText: "No saved rosters yet.",
  useCount: useRosterCount,
  // The landing's library-level FACTS (#1209): what these rosters CARRY (B10's automation-rules rider) and
  // when the library last changed — the two things a row cannot state about the library.
  insights: { useInsights: useRosterInsights },
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
