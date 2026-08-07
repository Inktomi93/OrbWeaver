// The Configuration SELECTION store (the config rail section · UI-Arch §4.2 rule 1: LIST selection drives
// CONTENT) — which collection MEMBER the workspace has open, as a (kind, member) PAIR.
//
// KINDED because the roster is ONE list over N sibling collections (review F-7): a tag row and a regex row
// are both "the selection", and only the kind says which contribution owns the CONTENT and CONTEXT halves.
// A `P extends string` primary could only express that by string-packing, which is the stringly state the
// house style rejects. Not persisted — landing back on the workspace welcome after a reload is fine.

import { openCollectionGroup } from "./config-group-open-store.ts";
import { createKindedSelectionStore } from "./create-kinded-selection-store.ts";
import { setActiveSection } from "./shell-store.ts";

const configSelection = createKindedSelectionStore("config-selection");

/** Open a member (kind + id) — CONTENT swaps to that collection's editor, and that collection's group
 *  EXPANDS so the roster shows the row that is open.
 *
 *  The expand is not a courtesy: groups start collapsed, so `+ New script` used to mount the new editor in
 *  CONTENT while the roster still read `REGEX SCRIPTS 2 ›` — the thing you had just made was invisible in
 *  the list, and with two rows both named "New script" there was no way to tell which one you were editing
 *  (side-eye 2026-08-03 P3). Selection and disclosure are one act: a selected member the LIST cannot show is
 *  a selection the user cannot see. `goToCollection` already paired the same two writes for the deep-link
 *  arm; this is that pairing homed where every selection passes. */
export function selectCollectionMember(kind: string, memberId: string): void {
  openCollectionGroup(kind);
  configSelection.select(kind, memberId);
}
/** Open a member from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export const selectCollectionMemberFromList = configSelection.selectFromList;
/** Clear the selection — back to the Configuration welcome (also fired after deleting the open member). */
export const clearCollectionSelection = configSelection.clear;
/** Reactive: the selected (kind, member) pair, or `null` for the welcome. */
export const useCollectionSelection = configSelection.useSelection;
/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule. */
export const configSectionSelection = configSelection.selection;

/** The cross-section deep-link intent: "take me to this library". Replaces `openSettingsTo("tags"|"regex")`
 *  at every call site the R1 migration killed — the ids left `SettingsCategoryId`, so tsc enumerated them.
 *
 *  It carries the KIND on purpose: with the roster's groups collapsed by default, a bare
 *  `setActiveSection("config")` would land a caller who asked for the script library on a closed door. So
 *  the intent expands that group, clears any stale member selection (the workspace opens on its welcome,
 *  not on whatever was last edited), and switches the rail — all through the SAME store actions the real UI
 *  calls, never a parallel path. */
export function goToCollection(kind: string): void {
  openCollectionGroup(kind);
  configSelection.clear();
  setActiveSection("config");
}
