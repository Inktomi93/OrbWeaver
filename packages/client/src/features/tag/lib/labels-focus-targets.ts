// The Labels panes' programmatic focus stops, named once: the surfaces stamp them and a closing confirm lands
// on them, because the control that opened the confirm leaves the tree with the tag it removed.

/** The `data-slot` of the tag library landing in CONTENT. */
export const LABELS_LIBRARY_SLOT = "labels-library";

/** The `data-slot` of the finder root in the LIST pane. */
export const LABELS_FINDER_SLOT = "labels-finder";

function bySlot(slot: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
}

/** The library landing when it is on screen, else the finder. */
export function libraryOrFinder(): HTMLElement | null {
  return bySlot(LABELS_LIBRARY_SLOT) ?? bySlot(LABELS_FINDER_SLOT);
}

/** The finder root: a removed row's own list. */
export function finderRoot(): HTMLElement | null {
  return bySlot(LABELS_FINDER_SLOT);
}
