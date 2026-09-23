// The TAGS collection contribution — the `collection` body of the `tags`
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
import { useCreateTagMember, useOpenPruneUnusedTags, useTagCount, useTagInsights, useTagMemberTitle, useTagSortControl } from "../hooks/use-tag-collection.ts";
import { TagMemberSurface } from "../surfaces/tag-member-surface.tsx";

export const tagCollection: CollectionContribution = {
  emptyText: "No tags yet.",
  useCount: useTagCount,
  // The landing's library-level FACTS (#1209 — what the LIST cannot state, from the same cached read).
  insights: { useInsights: useTagInsights },
  useMemberTitle: useTagMemberTitle,
  create: { label: "New tag", useRun: useCreateTagMember },
  // THE SORT IS THE HOST'S CHROME AND THE TAG LIBRARY'S DATA (#1725, DESIGN.md §3.2, board 02's
  // `Most used ▾`). It used to be a `<Select>` the ROWS drew one line under the host's band — the second
  // chrome grammar C-4 forbids, and the reason the board moves it up into the control row. Only the control
  // moved: the mode's home is still `state/tag-library-store.ts` and the comparator still runs inside
  // `TagCollectionRows`, because sorting is over members and the host never sees one.
  sort: { label: "Sort tags", useMode: useTagSortControl },
  // The library-level verb, in the overflow beside Import (which tags do not declare). It is the ONE tag
  // verb whose subject is the whole library rather than a member — Delete/Merge are the row kebab's and the
  // editor's. The runner opens the rows' own confirm; the host never learns what it does (`actions`).
  actions: [{ label: "Prune unused tags", tone: "danger", useRun: useOpenPruneUnusedTags }],
  list: (view) => <TagCollectionRows view={view} />,
  // The WHOLE view: the editor draws the drill row out of `library` too (#1747, §3.4).
  detail: (view) => <TagMemberSurface view={view} />,
  context: {
    kind: "none",
    title: "Nothing to attach",
    // "…is on the left" WAS TRUE AND IS NOT (#1725, stickler F14): a tag's usage census rendered as its row's
    // trailing `markers`, in the LIST pane, which was literally to the left of this one. The owner moved the
    // member rows into CONTENT, so the sentence now points at a pane that holds the settings map. The claim
    // it was making survives — the usage IS stated, on the tag's own row — so the fix is to drop the stale
    // DIRECTION rather than the fact, and let the row say where it says it.
    description: "A tag applies wherever you put it — there is no separate attachment to manage. Its usage across your library is on its row.",
  },
};
