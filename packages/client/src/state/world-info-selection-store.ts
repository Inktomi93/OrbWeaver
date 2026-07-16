// The world-info SELECTION store (World Info rail section · UI-Arch §4.2 rule 1: LIST selection drives
// CONTENT). Holds which BOOK the section has open (CONTENT renders its entry editor, else the teaching
// welcome) and which ENTRY inside that book is being edited. Its own per-section concern, remembered
// independently. A secondary-drill `createDrillSelectionStore` with the LIST overlay dual-write (not
// persisted — landing back on the section welcome after a hard reload is fine).

import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store";

const worldInfoSelection = createDrillSelectionStore<WorldBookId, WorldEntryId>("world-info-selection", { secondary: true });

/** Open a book (a library-row click) — CONTENT swaps to its entry editor; a stale entry is cleared. */
export const selectWorldBook = worldInfoSelection.select;
/** Open a book from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export const selectWorldBookFromList = worldInfoSelection.selectFromList;
/** Clear the selection (back to the World Info welcome state — e.g. after deleting the open book). */
export const clearWorldBookSelection = worldInfoSelection.clear;
/** Select an entry to edit (an entry-row click reveals its field editor). */
export const selectWorldEntry = worldInfoSelection.selectSecondary;
/** Clear the entry selection — back to the entry-list overview (also fired on entry delete). */
export const clearWorldEntrySelection = worldInfoSelection.clearSecondary;
/** Reactive: the currently-open book id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedWorldBookId = worldInfoSelection.usePrimaryId;
/** Reactive: the currently-edited entry id (`null` = none). A primitive selector. */
export const useSelectedWorldEntryId = worldInfoSelection.useSecondaryId;
