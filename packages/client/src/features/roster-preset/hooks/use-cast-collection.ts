// The cast COLLECTION's host-facing hooks (the `CollectionContribution` seam — B10's library-management
// surface): the group census, the open member's title, and the create runner. All hooks because a
// definition is a module-level value — the host calls them unconditionally, once, per rendered
// affordance. Census + title are NON-suspending cache reads of the SAME `rosterPreset.list` key the
// rows and the picker read (the tag-collection discipline: a second reader, never a second request).

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { openModal } from "#state";

/** The group band's live census ("CASTS · 4"). */
export function useCastCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.rosterPreset.list.queryOptions()).data?.length;
}

/** The OPEN member's name for the mobile pushed frame's topbar (`useMemberTitle`) — the same cached list. */
export function useCastMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.rosterPreset.list.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner. A cast is authored BY EXAMPLE (D61/B10 — snapshot a room you host; a from-scratch
 *  form would need a character multi-select the saved-casts modal already IS), so create opens the
 *  authoring door rather than minting an empty row a min-1-member schema would refuse. */
export function useCreateCastMember(): () => void {
  return (): void => {
    openModal("savedRosters");
  };
}
