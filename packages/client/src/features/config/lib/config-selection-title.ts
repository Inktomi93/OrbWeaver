// The Configuration section's `useSelectionTitle` — the mobile pushed frame's topbar names what is OPEN
// (side-eye P2): the open MEMBER by its own name, else the ACTIVE GROUP (a pushed settings group names
// itself in the back row — config-revamp-design.md §3.6), never the section.
//
// A member's name comes from the owning collection's `useMemberTitle` seam (cache-first, the census's
// discipline); a collection that declares none falls back to its group's `label`, which is honest ("Tags")
// rather than blank.
//
// ONE hook call, at the top level, for the OPEN member's kind — and the contract that makes a kind switch
// safe without a remount lives on `CollectionContribution.useMemberTitle`: it must be exactly one
// cache-first `useQuery`, so every collection's resolver has the same hook shape and swapping which one
// runs changes a query KEY, never the hook set. (Calling all of them in a loop instead would be a hook call
// inside a callback — `useHookAtTopLevel` refuses it, and rightly.)

import type { ConfigGroupRegistry } from "#state";
import { isCollectionGroup, useActiveConfigGroup, useCollectionSelection } from "#state";
import { collectionGroups } from "./order-groups.ts";

export function useConfigSelectionTitle(groups: ConfigGroupRegistry): string | null {
  const selection = useCollectionSelection();
  const activeGroup = useActiveConfigGroup();
  // The registry is door-frozen and total over its ids, and a member selection can only be written by a
  // rendered collection group — so a non-null selection always resolves to a collection group. The
  // no-selection arm still calls the hook (with an id no row can match) rather than skipping it.
  const selected = selection === null ? undefined : groups.get(selection.kind as ConfigGroupRegistryId);
  const collection = selected !== undefined && isCollectionGroup(selected) ? selected : collectionGroups(groups)[0];
  // No `?.` on the hook itself: `useMemberTitle` is REQUIRED on the contract (#1219) precisely so this
  // call cannot vanish with the contribution. (The `collection?.` guard is the registry's own totality,
  // not a per-contribution capability — see the note above.)
  const memberTitle = collection?.body.collection.useMemberTitle(selection?.memberId ?? "");
  if (selection !== null) {
    return memberTitle ?? collection?.label ?? null;
  }
  return activeGroup === null ? null : groups.get(activeGroup).label;
}

type ConfigGroupRegistryId = Parameters<ConfigGroupRegistry["get"]>[0];
