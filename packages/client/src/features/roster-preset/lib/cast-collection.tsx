// The cast collection — B10's library-management surface, a Configuration-section
// `CollectionContribution` (the tag/regex/world-info door array; interaction-direction-spec.md B10:
// "library management: a Configuration-section CollectionContribution"). The rows scan the saved-cast
// library; the mounted member editor renames/describes/starts; authoring stays BY EXAMPLE through the
// saved-casts modal (create opens that door — a from-scratch form would be a second composer for an
// artifact the room already composes).

import { Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { CollectionContribution, CollectionDetailView, CollectionListView } from "#lib";
import { CastCollectionRows } from "../components/cast-collection-rows.tsx";
import { useCastCount, useCastMemberTitle, useCreateCastMember } from "../hooks/use-cast-collection.ts";
import { CastMemberSurface } from "../surfaces/cast-member-surface.tsx";

/** The collection KIND (registry key + the selection store's kind axis). */
const CAST_COLLECTION_ID = "cast";

function renderList(view: CollectionListView): ReactElement {
  return <CastCollectionRows view={view} />;
}

function renderDetail(view: CollectionDetailView): ReactElement {
  return <CastMemberSurface view={view} />;
}

export const castCollection: CollectionContribution = {
  id: CAST_COLLECTION_ID,
  label: "Casts",
  icon: Users,
  order: 40,
  // B10's rules rider is named here because this card is the one place a user browsing the library learns
  // what a cast IS — and applying one switches automation on in the room (side-eye 2026-08-29 P2-6).
  blurb: "Saved casts — a named group of characters with their seat knobs and the room's enabled rules, ready to drop into any chat.",
  emptyText: "No saved casts yet.",
  useCount: useCastCount,
  useMemberTitle: useCastMemberTitle,
  create: { label: "New cast", useRun: useCreateCastMember },
  list: renderList,
  detail: renderDetail,
  context: {
    kind: "none",
    title: "Nothing to attach",
    description: "A saved cast is a template — it attaches to nothing. Start a chat from it, or add it to a room you host, from the Members tab.",
  },
};
