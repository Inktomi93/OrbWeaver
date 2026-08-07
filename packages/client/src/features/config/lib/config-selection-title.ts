// The Configuration section's `useSelectionTitle` — the mobile pushed frame's topbar names the OPEN MEMBER,
// not the section (side-eye P2). The workspace is KINDED, so the name comes from the owning contribution's
// `useMemberTitle` seam (cache-first, the census's discipline); a collection that declares none falls back
// to its own singular `label`, which is honest ("Tags") rather than blank.
//
// A hook that TAKES the registry (rather than a factory closing over it): the collections registry is a
// door-frozen value handed to the section at composition, exactly as `list`/`content`/`context` are, and
// the section's definition binds it at the same call site those slots are bound.
//
// ONE hook call, at the top level, for the OPEN member's kind — and the contract that makes a kind switch
// safe without a remount lives on `CollectionContribution.useMemberTitle`: it must be exactly one
// cache-first `useQuery`, so every collection's resolver has the same hook shape and swapping which one
// runs changes a query KEY, never the hook set. (Calling all of them in a loop instead would be a hook call
// inside a callback — `useHookAtTopLevel` refuses it, and rightly.)

import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useCollectionSelection } from "#state";

export function useConfigSelectionTitle(collections: ContributorRegistry<CollectionContribution>): string | null {
  const selection = useCollectionSelection();
  // The registry is door-frozen and total over its kinds, and a selection can only be written by a rendered
  // group — so a non-null selection always resolves. The no-selection arm still calls the hook (with an id
  // no row can match) rather than skipping it.
  const contribution = selection === null ? collections.list()[0] : collections.get(selection.kind);
  const memberTitle = contribution?.useMemberTitle?.(selection?.memberId ?? "");
  if (selection === null) {
    return null;
  }
  return memberTitle ?? contribution?.label ?? null;
}
