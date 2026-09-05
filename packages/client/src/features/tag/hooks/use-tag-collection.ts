// The tag COLLECTION's host-facing hooks (the `CollectionContribution` seam): the group count and the
// create verb. Both are hooks because a definition is a module-level value — the host calls them
// unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionCount, CollectionInsight } from "#lib";
import { selectCollectionMember } from "#state";
import { TAG_COLLECTION_ID } from "../lib/tags-model.ts";
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
