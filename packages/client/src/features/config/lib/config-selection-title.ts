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
//
// NO CENSUS RIDES THIS ROW, and that is a decision, not an omission (#1676 — the sweep that gave every other
// list-bearing section's phone topbar its library size). The rule it applies is "the phone gets the census the
// shed band title took with it", and this section's band never had one: `config-section.tsx` renders
// `<ListPaneHeader title={CONFIG_SECTION_LABEL} />` with no `count` prop at all. The reason is not an
// oversight either — the Configuration LIST is a nav of settings GROUPS, so a number beside it would count
// doors, not a library, and "Settings · 9" is a fact about the app's own chrome rather than about anything
// the reader owns. If the LIST ever becomes a collection of the reader's things, the band earns the census
// first and this row follows it — never the other way round.
//
// WHY THE `?.` ON `collection` SURVIVES, stated so the next reader does not re-open it as an oversight
// (#1622, investigated 2026-09-05 and REFUSED with this receipt). The fallback `collectionGroups(groups)[0]`
// is what keeps the call unconditional when nothing is selected, and it types as possibly-undefined for a
// reason no local edit reaches:
//   · `collectionGroups` is a runtime `.filter(isCollectionGroup)` over `Registry.list()`, and no filter can
//     hand back a type that says "at least one" — under `noUncheckedIndexedAccess`, `[0]` is optional by law;
//   · the registry COULD carry the guarantee, but only if `Registry<Id, Def>` (`#lib/registry.ts`) narrowed
//     `Def` PER KEY, so the four collection ids resolved to `CollectionGroupDefinition`. It is uniform in
//     `Def` for every id, and every registry in the app (sections, modals, chrome, home tiles, config groups)
//     goes through it — a codebase-wide change, not this row's;
//   · an assertion cannot stand in: it would have to run BEFORE the hook below, which is an early return in
//     front of a hook — precisely the rules-of-hooks defect the row set out to remove.
// The RUNTIME risk is nil and is a separate fact from the type: the door's `Record` is total over
// `CONFIG_GROUP_IDS`, whose collections segment is four ids, so the list is never empty in a composed app —
// and `groups` is door-frozen, so this value cannot change identity across renders of one fiber. THE
// RECEIPT, because "door-frozen" is a claim a reader should be able to check (#1632 item 7): the ONE
// assembly is `compose/authed-app.tsx`'s module-scope `const configGroups = createRegistry("config-groups",
// CONFIG_GROUP_IDS, {…})` (~:251), evaluated once at module init and never rebuilt — which is also what
// makes the CONDITIONAL hook call below safe, since `collection` cannot go from defined to undefined (or
// back) across the lifetime of any fiber that reads it. What DOES
// govern this site is the #1203 law recorded on `CollectionContribution.useCount`: a persistent, unkeyable
// hook host — the topbar title is the named example — forces the contract field REQUIRED rather than keying
// the fiber. That half is #1219's, on `useMemberTitle` itself, not this file's.

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
