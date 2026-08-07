// The tag COLLECTION's host-facing hooks (the `CollectionContribution` seam): the group count and the
// create verb. Both are hooks because a definition is a module-level value — the host calls them
// unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import { selectCollectionMember } from "#state";
import { TAG_COLLECTION_ID } from "../lib/tags-model.ts";
import { useCreateTag } from "./use-tag-settings-mutations.ts";

/** The name a created tag lands with — the member editor's Name field is the rename affordance, so create
 *  no longer needs its own name dialog (C-7: the editor is MOUNTED, so create-then-edit is one motion). */
const NEW_TAG_NAME = "New tag";

/** The group band's live census — a NON-suspending read sharing the rows' cache, so the band renders
 *  immediately and the number settles under it. */
export function useTagCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data?.length;
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
    void create.mutateAsync({ input: { name: NEW_TAG_NAME } }).then((created) => {
      selectCollectionMember(TAG_COLLECTION_ID, created.id);
    });
  };
}
