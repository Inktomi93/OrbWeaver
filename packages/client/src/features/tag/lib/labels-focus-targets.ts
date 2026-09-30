// The Labels panes' programmatic focus stops, named once: the surfaces stamp them and a closing confirm lands
// on them, because the control that opened the confirm leaves the tree with the tag it removed.

/** The `data-slot` of the tag library landing in CONTENT. */
export const LABELS_LIBRARY_SLOT = "labels-library";

/** The `data-slot` of the finder root in the LIST pane. */
export const LABELS_FINDER_SLOT = "labels-finder";

function bySlot(slot: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
}

// On a phone the library stays mounted inside the hidden, inert CONTENT column, where focus() is a no-op.
function canTakeFocus(element: HTMLElement | null): element is HTMLElement {
  return element !== null && element.closest("[inert]") === null && element.getClientRects().length > 0;
}

/** The library landing when it is on screen, else the finder. */
export function libraryOrFinder(): HTMLElement | null {
  const library = bySlot(LABELS_LIBRARY_SLOT);
  return canTakeFocus(library) ? library : bySlot(LABELS_FINDER_SLOT);
}

/** The finder root: a removed row's own list. */
export function finderRoot(): HTMLElement | null {
  return bySlot(LABELS_FINDER_SLOT);
}
