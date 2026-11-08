// The names a row's actions menu prints for its two shared verbs. A zero-import leaf, so a spec's node side reads them
// without loading the component graph.

/** The rename item of a row or room actions menu. */
export const ROW_RENAME_NAME = "Rename";

/** The destructive item a `RowActionsMenu` prints when its caller names none. */
export const ROW_DELETE_NAME = "Delete";

/** The export item of a library row's actions menu. */
export const ROW_EXPORT_NAME = "Export";

/** The duplicate item of a library row or section actions menu. */
export const ROW_DUPLICATE_NAME = "Duplicate";

/** The confirm a row's destructive Delete opens, named for its subject. */
export function deleteConfirmTitle(subject: string): string {
  return `Delete "${subject}"?`;
}
