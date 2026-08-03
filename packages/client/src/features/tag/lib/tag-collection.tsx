// The TAGS collection contribution (config-rail-spec.md · review §4) — co-located with its owner, assembled
// at the door into the `config-collections` registry, consumed BLIND by `features/config`.
//
// It replaces the `tags` settings PANE (D114's "features/tag owns its pane in surface mode" clause is
// amended by this migration, not reversed: the feature still owns its surface, the surface just stopped
// being a modal pane). Tags label characters, chats, world books, personas and presets — no other feature
// is their reader, so the library homes here.
//
// `context: {kind:"none"}` with its OWN copy: a tag has no attachment to manage — it applies wherever you
// put it — and the host saying a generic "nothing selected" over a SELECTED tag would be a lie.

import { Hash } from "@orb/ui/icons";
import type { CollectionContribution } from "#lib";
import { TagCollectionRows } from "../components/tag-collection-rows.tsx";
import { useCreateTagMember, useTagCount } from "../hooks/use-tag-collection.ts";
import { TagMemberSurface } from "../surfaces/tag-member-surface.tsx";
import { TAG_COLLECTION_ID } from "./tags-model.ts";

export const tagCollection: CollectionContribution = {
  id: TAG_COLLECTION_ID,
  label: "Tags",
  icon: Hash,
  order: 10,
  blurb: "Colour-coded labels for characters, chats, books, personas and presets.",
  emptyText: "No tags yet.",
  useCount: useTagCount,
  create: { label: "New tag", useRun: useCreateTagMember },
  list: (view) => <TagCollectionRows view={view} />,
  detail: (view) => <TagMemberSurface memberId={view.memberId} />,
  context: {
    kind: "none",
    title: "Nothing to attach",
    description: "A tag applies wherever you put it — there is no separate attachment to manage. Its usage across your library is on the left.",
  },
};
