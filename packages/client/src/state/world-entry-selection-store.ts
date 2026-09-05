// The world-ENTRY selection store — which entry inside the open book is being edited.
//
// It was the SECONDARY half of a book+entry drill store until R2 moved World Info off the rail: the BOOK is
// the Configuration workspace's kinded member selection now (`config-selection-store.ts`), so the book half
// would have been a primary nobody writes. What is left is a primary-only drill over entries, which is what
// this always was underneath. Not persisted — landing back on a book's entry list after a reload is fine.
//
// A REMEMBERED ENTRY NEEDS NO CLEARING when the open book changes: the member surface resolves it against
// the CURRENT book's entry list (`entries.find`), and entry ids are unique across books — so a stale id from
// another book simply doesn't match and the surface shows the entry list. Coming back to a book you were
// mid-edit in re-opens exactly where you left it, which is the better half of the same behaviour.

import type { WorldEntryId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const worldEntrySelection = createDrillSelectionStore<WorldEntryId>("world-entry-selection");

/** Select an entry to edit (an entry-row click reveals its field editor). */
export const selectWorldEntry = worldEntrySelection.select;
/** Clear the entry selection — back to the entry-list overview (also fired on entry delete). */
export const clearWorldEntrySelection = worldEntrySelection.clear;
/** Reactive: the currently-edited entry id (`null` = none). A primitive selector. */
export const useSelectedWorldEntryId = worldEntrySelection.usePrimaryId;
/** The imperative seam the config section's mobile BACK stack pops FIRST (#1725, stickler F9). A world-info
 *  book is a three-rung drill on a phone — library → book → entry — and the shell's one Back has to pop the
 *  rung the reader is actually on. Before this, shell-Back from an open entry popped the BOOK, so the entry
 *  editor and its book both vanished in one tap and the reader landed two rungs up from where they were.
 *  Exported as the store's own `selection` seam rather than as a bare `hasSelection`, because the config
 *  section subscribes to it too: a rung that changes without notifying the shell is a Back button whose
 *  target is stale. */
export const worldEntrySelectionSeam = worldEntrySelection.selection;
