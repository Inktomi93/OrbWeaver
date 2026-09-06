// The tag COLLECTION's host-facing hooks (the `CollectionContribution` seam): the group count and the
// create verb. Both are hooks because a definition is a module-level value — the host calls them
// unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionContribution, CollectionCount, CollectionInsight } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import { selectCollectionMember, setTagPruneConfirmOpen, setTagSortMode, useTagSortMode } from "#state";
import { TAG_COLLECTION_ID, tagSortItems } from "../lib/tags-model.ts";
import { useCreateTag } from "./use-tag-settings-mutations.ts";

/** The name a created tag lands with — the member editor's Name field is the rename affordance, so create
 *  no longer needs its own name dialog (C-7: the editor is MOUNTED, so create-then-edit is one motion). */
const NEW_TAG_NAME = "New tag";

/** The group band's live census — a NON-suspending read sharing the rows' cache, so the band renders
 *  immediately and the number settles under it. A FAILED read says so rather than reading as absence
 *  (#1546 — the host cannot draw a failure arm for a state the contract cannot express). */
export function useTagCount(): CollectionCount {
  const trpc = useTRPC();
  const census = useQuery(trpc.tag.listTagsWithUsage.queryOptions());
  // `refetch` takes an OPTIONS BAG, so it is wrapped rather than passed by reference.
  return { count: census.data?.length, failed: census.error !== null, retry: (): void => void census.refetch() };
}

/**
 * THE TAG LIBRARY'S OWN LANDING FACTS (the `insights` seam — #1209 replaced the preview wall with these).
 *
 * WHAT THE LIST CANNOT SAY, which is the whole bar the ruling set: the rows show tags by name and usage
 * total, one screen at a time. What no row can state is a fact about the LIBRARY — how much of it is doing
 * nothing. An unused tag is the tag library's own failure mode (it accumulates: every card import, every
 * abandoned scheme), and it is invisible in a 400-row list sorted by use because the answer is at the far
 * end of the scroll.
 *
 * BOTH FACTS COME FROM THE SAME CACHED READ the census and the rows already loaded (the `useMemberTitle`
 * discipline) — never a second request. The unused fact carries a DOOR because it is about members the
 * reader will want to act on; the in-use fact is a statement and renders as one, because data that dressed
 * as an affordance is exactly what #1209 deleted.
 */
export function useTagInsights(): readonly CollectionInsight[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data;
  if (rows === undefined) {
    return rows;
  }
  const unused = rows.filter((row) => row.usage.total === 0);
  const first = unused[0];
  return [
    {
      id: "unused",
      label: "Labelling nothing",
      value: `${String(unused.length)} of ${String(rows.length)}`,
      // The door opens the FIRST unused tag — a real member, in the editor, where the reader can rename or
      // delete it. Omitted when there are none: a door to nothing is the dead end this seam exists to end.
      ...(first === undefined ? {} : { open: { label: `Open ${first.name}`, run: (): void => selectCollectionMember(TAG_COLLECTION_ID, first.id) } }),
    },
    { id: "in-use", label: "In use", value: String(rows.length - unused.length) },
  ];
}

/** The OPEN member's name for the mobile pushed frame's topbar (the `useMemberTitle` seam) — the SAME
 *  cached list the census and the rows read, so this is a cache hit and never a second request. */
export function useTagMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner: mint a tag, then OPEN it in CONTENT — a create that leaves the user looking at the
 *  thing they just made, which is the whole reason the editor is mounted rather than popped. */
export function useCreateTagMember(): () => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateTag({ trpc, invalidation });
  return (): void => {
    create.mutate({ input: { name: NEW_TAG_NAME } }, { onSuccess: (created): void => selectCollectionMember(TAG_COLLECTION_ID, created.id) });
  };
}

/** The library's READING ORDER as the host's control row wants it (`CollectionContribution.sort`) — the
 *  MODE, its writer, and the option set.
 *
 *  THE COMPARATOR IS NOT HERE, and that is the seam's split rather than an omission: sorting runs over
 *  MEMBERS and the host never sees one, so `sortTagsBy` stays inside `TagCollectionRows`. Both sides read
 *  `state/tag-library-store.ts`, which is the mode's one home — so the rows read exactly the mode this
 *  control writes, without a `CollectionListView` field restating a value that already has an address.
 *
 *  The option set depends on the library's SIZE (drag handles cannot exist in a windowed list), so this
 *  reads the SAME cached list the census and the rows read — a cache hit, never a second request, the
 *  `useMemberTitle` discipline. A read that has not landed is treated as "handles available": the small-arm
 *  option set is the one that offers more, and a settling read must not disable a control it cannot judge. */
export function useTagSortControl(): ReturnType<NonNullable<CollectionContribution["sort"]>["useMode"]> {
  const trpc = useTRPC();
  const rows = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data;
  const mode = useTagSortMode();
  const handlesAvailable = (rows?.length ?? 0) <= COLLECTION_LARGE_GROUP;
  return {
    mode,
    // The seam is host-OPAQUE strings, so the value comes back widened; the option set the host rendered
    // came from `TAG_SORT_MODES`, and the store's own persist `migrate` is the total guard for anything
    // else. A `find` over the canonical tuple is the narrowing, never a cast.
    setMode: (next: string): void => {
      const picked = tagSortItems(handlesAvailable, COLLECTION_LARGE_GROUP).find((option) => option.value === next);
      if (picked !== undefined) {
        setTagSortMode(picked.value);
      }
    },
    options: tagSortItems(handlesAvailable, COLLECTION_LARGE_GROUP),
  };
}

/** "Prune unused tags" as a library-level action (`CollectionContribution.actions`) — the runner OPENS the
 *  confirm the rows own, and fires nothing itself.
 *
 *  THE VERB IS DESTRUCTIVE AND MASS (394 rows at the owner's library), so the click that reaches it may
 *  never be the click that performs it (side-eye 2026-08-03 P2). The confirm needs the live unused COUNT
 *  and the cascade copy, which are the ROWS' knowledge, so the dialog stays inside `list` and this runner
 *  writes the flag it is bound to — see `state/tag-library-store.ts`'s `pruneConfirmOpen`. */
export function useOpenPruneUnusedTags(): () => void {
  return (): void => {
    setTagPruneConfirmOpen(true);
  };
}
