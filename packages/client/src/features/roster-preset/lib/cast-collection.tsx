// The cast collection — B10's library-management surface, a Configuration-section
// `CollectionContribution` (the tag/regex/world-info door array; interaction-direction-spec.md B10:
// "library management: a Configuration-section CollectionContribution"). The rows scan the saved-cast
// library; the mounted member editor renames/describes/starts; authoring stays BY EXAMPLE through the
// saved-casts modal (create opens that door — a from-scratch form would be a second composer for an
// artifact the room already composes).

import type { ReactElement } from "react";
import type { CollectionContribution, CollectionDetailView, CollectionListView } from "#lib";
import { CastCollectionRows } from "../components/cast-collection-rows.tsx";
import { useCastCount, useCastMemberTitle, useCreateCastMember } from "../hooks/use-cast-collection.ts";
import { CastMemberSurface } from "../surfaces/cast-member-surface.tsx";

/** The collection KIND — the `cast` config group id (registry key + the selection store's kind axis). */
export const CAST_COLLECTION_ID = "cast";

function renderList(view: CollectionListView): ReactElement {
  return <CastCollectionRows view={view} />;
}

function renderDetail(view: CollectionDetailView): ReactElement {
  return <CastMemberSurface view={view} />;
}

export const castCollection: CollectionContribution = {
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
