// The roster COLLECTION's host-facing hooks (the `CollectionContribution` seam — B10's library-management
// surface): the group census, the open member's title, and the create runner. All hooks because a
// definition is a module-level value — the host calls them unconditionally, once, per rendered
// affordance. Census + title are NON-suspending cache reads of the SAME `rosterPreset.list` key the
// rows and the picker read (the tag-collection discipline: a second reader, never a second request).

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { CollectionCount, CollectionInsight } from "#lib";
import { timeLib } from "#lib";
import { openModal, selectCollectionMember } from "#state";
import { ROSTER_COLLECTION_ID } from "../lib/roster-model.ts";

/** The group band's live census ("ROSTERS · 4"). A FAILED read says so rather than reading as absence
 *  (#1546 — see {@link CollectionCount}). */
export function useRosterCount(): CollectionCount {
  const trpc = useTRPC();
  const census = useQuery(trpc.rosterPreset.list.queryOptions());
  // `refetch` takes an OPTIONS BAG, so it is wrapped rather than passed by reference.
  return { count: census.data?.length, failed: census.error !== null, retry: (): void => void census.refetch() };
}

/**
 * THE ROSTER LIBRARY'S OWN LANDING FACTS (the `insights` seam, #1209).
 *
 * WHAT THE LIST CANNOT SAY. A row names one roster; what no row states is what the library is FOR at a
 * glance — how many of these rosters carry the room's automation rules with them (B10's rider: applying a
 * roster switches those rules on, which is the fact a reader most needs before they drop one into a chat)
 * and which one they saved last. This is the library the reviewer's crash repro reached FIRST because it
 * declared no facts at all: a landing that said the name of the library back to the reader and stopped.
 *
 * ONE CACHED READ — the same `rosterPreset.list` key the census and the member title share.
 */
export function useRosterInsights(): readonly CollectionInsight[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.rosterPreset.list.queryOptions()).data;
  if (rows === undefined) {
    return rows;
  }
  const withRules = rows.filter((roster) => roster.rules.length > 0);
  const first = withRules[0];
  const newest = [...rows].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return [
    {
      id: "with-rules",
      label: "With room rules",
      value: `${String(withRules.length)} of ${String(rows.length)}`,
      ...(first === undefined ? {} : { open: { label: `Open ${first.name}`, run: (): void => selectCollectionMember(ROSTER_COLLECTION_ID, first.id) } }),
    },
    ...(newest === undefined
      ? []
      : [
          {
            id: "last-saved",
            label: "Last saved",
            value: timeLib.formatRelative(newest.updatedAt),
            open: { label: `Open ${newest.name}`, run: (): void => selectCollectionMember(ROSTER_COLLECTION_ID, newest.id) },
          },
        ]),
  ];
}

/** The OPEN member's name for the mobile pushed frame's topbar (`useMemberTitle`) — the same cached list. */
export function useRosterMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.rosterPreset.list.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner. A roster is authored BY EXAMPLE (D61/B10 — snapshot a room you host; a from-scratch
 *  form would need a character multi-select the saved-rosters modal already IS), so create opens the
 *  authoring door rather than minting an empty row a min-1-member schema would refuse. */
export function useCreateRosterMember(): () => void {
  return (): void => {
    openModal("savedRosters");
  };
}
