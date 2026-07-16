// The world-info SELECTION store (World Info rail section · UI-Arch §4.2 rule 1: LIST selection drives
// CONTENT). Holds which BOOK the section has open (the route renders its entry editor in CONTENT, else the
// teaching welcome) and which ENTRY inside that book is being edited. Its own per-section concern,
// remembered independently (§4.2 rule 2), mirroring preset-selection-store / character-selection-store. NOT
// persisted (`createGatedStore`): a transient device-local UI selection — landing back on the section
// welcome after a hard reload is fine (state-law recap, UI-Arch §5). Two fields, well under the ≤10 cap; a
// non-null bookId IS "a book is open", a non-null entryId IS "an entry is being edited".

import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";
import { setOpenOverlayPanel } from "./shell-store";

interface WorldInfoSelectionState {
  /** The book whose editor the World Info CONTENT shows — `null` = the section's welcome state. */
  readonly selectedBookId: WorldBookId | null;
  /** The entry inside the open book whose fields the editor shows — `null` = the entry-list overview. */
  readonly selectedEntryId: WorldEntryId | null;
}

const useWorldInfoSelectionStore = createGatedStore<WorldInfoSelectionState>(
  "world-info-selection",
  (): WorldInfoSelectionState => ({ selectedBookId: null, selectedEntryId: null }),
);

/** Open a book (a library-row click) — the route swaps CONTENT to that book's entry editor. Opening a
 *  DIFFERENT book clears the entry selection so a stale entry never carries across books. */
export function selectWorldBook(id: WorldBookId): void {
  useWorldInfoSelectionStore.setState({ selectedBookId: id, selectedEntryId: null }, false, "world-info-selection/select-book");
}

/** Open a book from the LIST (a library-row click) AND close any open LIST slide-over — the
 *  viewport-unaware intent form of the old route-closure `selectWorldBookFromList`: `openOverlayPanel` is
 *  read only in an overlay regime (`useShellLayout`), so the unconditional write is a no-op when the LIST
 *  is docked. */
export function selectWorldBookFromList(id: WorldBookId): void {
  selectWorldBook(id);
  setOpenOverlayPanel(null);
}

/** Clear the selection (back to the World Info welcome state — e.g. after deleting the open book). */
export function clearWorldBookSelection(): void {
  useWorldInfoSelectionStore.setState({ selectedBookId: null, selectedEntryId: null }, false, "world-info-selection/clear-book");
}

/** Select an entry to edit (an entry-row click reveals its field editor). */
export function selectWorldEntry(id: WorldEntryId): void {
  useWorldInfoSelectionStore.setState({ selectedEntryId: id }, false, "world-info-selection/select-entry");
}

/** Clear the entry selection — back to the entry-list overview (also fired on entry delete). */
export function clearWorldEntrySelection(): void {
  useWorldInfoSelectionStore.setState({ selectedEntryId: null }, false, "world-info-selection/clear-entry");
}

/** Reactive: the currently-open book id (`null` = none). A primitive selector (no fresh object). */
export function useSelectedWorldBookId(): WorldBookId | null {
  return useWorldInfoSelectionStore((s) => s.selectedBookId);
}

/** Reactive: the currently-edited entry id (`null` = none). A primitive selector. */
export function useSelectedWorldEntryId(): WorldEntryId | null {
  return useWorldInfoSelectionStore((s) => s.selectedEntryId);
}
