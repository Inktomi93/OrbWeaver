// The Configuration MEMBER SELECTION store (the config rail section · UI-Arch §4.2 rule 1: LIST selection
// drives CONTENT) — which collection MEMBER the workspace has open, as a (kind, member) PAIR. The kind IS
// the member's group id (`ConfigGroupId`, owner fork F-1 closed the tuple); the seam's own type stays the
// factory's opaque string, and `config-nav-store.ts` narrows it through `isConfigGroupId` when it derives
// the effective active group.
//
// KINDED because the LIST is ONE column over N sibling collections (review F-7): a tag row and a regex row
// are both "the selection", and only the kind says which contribution owns the CONTENT and CONTEXT halves.
// A `P extends string` primary could only express that by string-packing, which is the stringly state the
// house style rejects. Not persisted — landing back on the workspace welcome after a reload is fine.
//
// `goToCollection(kind)` — the cross-section deep link this store used to carry — is `openConfigTo(group)`
// in `config-nav-store.ts` now: one intent for every kind of group, not one per family.

import type { ConfigGroupId } from "./config-group-ids.ts";
import { openConfigGroup } from "./config-group-open-store.ts";
import { createKindedSelectionStore } from "./create-kinded-selection-store.ts";

const configSelection = createKindedSelectionStore("config-selection");

/** Open a member (kind + id) — CONTENT swaps to that collection's editor, and that collection's group
 *  EXPANDS so the LIST shows the row that is open.
 *
 *  The expand is not a courtesy: groups start collapsed, so `+ New script` used to mount the new editor in
 *  CONTENT while the LIST still read `REGEX SCRIPTS 2 ›` — the thing you had just made was invisible in
 *  the list, and with two rows both named "New script" there was no way to tell which one you were editing
 *  (side-eye 2026-08-03 P3). Selection and disclosure are one act: a selected member the LIST cannot show is
 *  a selection the user cannot see. The member's group is the EFFECTIVE active group by derivation
 *  (`useActiveConfigGroup`), so no second write is needed here. */
export function selectCollectionMember(kind: ConfigGroupId, memberId: string): void {
  openConfigGroup(kind);
  configSelection.select(kind, memberId);
}
/** Open a member from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export function selectCollectionMemberFromList(kind: ConfigGroupId, memberId: string): void {
  openConfigGroup(kind);
  configSelection.selectFromList(kind, memberId);
}
/** Clear the selection — back to the Configuration welcome (also fired after deleting the open member). */
export const clearCollectionSelection = configSelection.clear;
/** Reactive: the selected (kind, member) pair, or `null` for the welcome. */
export const useCollectionSelection = configSelection.useSelection;
/** The member half of the section-registry SEAM (`SectionSelection`) — `makeConfigSection` composes it
 *  with the group half (`config-nav-store.ts`) into the one seam the SHELL reads for the mobile ONE-SHELL rule. */
export const collectionMemberSelection = configSelection.selection;
