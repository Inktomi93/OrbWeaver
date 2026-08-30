// The TAGS collection contribution (config-rail-spec.md · review §4) — the `collection` body of the `tags`
// config group (`tags-group.tsx`, which carries the library's identity since the config revamp #866 S1),
// consumed BLIND by `features/config`.
//
// It replaces the `tags` settings PANE (D114's "features/tag owns its pane in surface mode" clause is
// amended by this migration, not reversed: the feature still owns its surface, the surface just stopped
// being a modal pane). Tags label characters, chats, world books, personas and presets — no other feature
// is their reader, so the library homes here.
//
// `context: {kind:"none"}` with its OWN copy: a tag has no attachment to manage — it applies wherever you
// put it — and the host saying a generic "nothing selected" over a SELECTED tag would be a lie.

import type { CollectionContribution } from "#lib";
import { TagCollectionRows } from "../components/tag-collection-rows.tsx";
import { useCreateTagMember, useTagCount, useTagMemberTitle, useTagPreview } from "../hooks/use-tag-collection.ts";
import { TagMemberSurface } from "../surfaces/tag-member-surface.tsx";

export const tagCollection: CollectionContribution = {
  emptyText: "No tags yet.",
  useCount: useTagCount,
  // The welcome hero's chip wall (program #102). Usage totals ride every row of the list the roster already
  // loaded, so the preview is a cache read of that same key. The kicker NAMES THE RANK ("Most used") rather
  // than letting the host assume one — regex and world-info rank by recency and by attachment.
  preview: { label: "Most used", useEntries: useTagPreview },
  useMemberTitle: useTagMemberTitle,
  create: { label: "New tag", useRun: useCreateTagMember },
  list: (view) => <TagCollectionRows view={view} />,
  detail: (view) => <TagMemberSurface memberId={view.memberId} />,
  context: {
    kind: "none",
    title: "Nothing to attach",
    description: "A tag applies wherever you put it — there is no separate attachment to manage. Its usage across your library is on the left.",
  },
};
