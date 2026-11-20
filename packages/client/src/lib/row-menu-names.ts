// The names a row's actions menu prints for the verbs more than one library shares. A zero-import leaf, so a spec's node side reads them
// without loading the component graph.

/** The rename item of a row or room actions menu. */
export const ROW_RENAME_NAME = "Rename";

/** The destructive item a `RowActionsMenu` prints when its caller names none. */
export const ROW_DELETE_NAME = "Delete";

/** The export item of a library row's actions menu. */
export const ROW_EXPORT_NAME = "Export";

/** The duplicate item of a library row or section actions menu. */
export const ROW_DUPLICATE_NAME = "Duplicate";

/** The star toggle of a chat or character row menu, one name per state. */
export const ROW_STAR_NAME = "Star";
export const ROW_UNSTAR_NAME = "Unstar";

/** The star toggle for the row's current state: it names the action a click takes. */
export function rowStarToggleName(starred: boolean): string {
  return starred ? ROW_UNSTAR_NAME : ROW_STAR_NAME;
}

/** The confirm a row's destructive Delete opens, named for its subject. */
export function deleteConfirmTitle(subject: string): string {
  return `Delete "${subject}"?`;
}
