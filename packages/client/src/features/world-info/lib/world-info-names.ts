// The accessible names the World Info collection and entry editor print. A zero-import leaf, so a spec's node side reads
// them without loading the component graph.

/** The books library's create action. */
export const WORLD_INFO_NEW_BOOK_NAME = "New book";

/** The create dialog's name field. */
export const WORLD_INFO_BOOK_NAME_FIELD_NAME = "Book name";

/** The books library's file import action. */
export const WORLD_INFO_IMPORT_BOOK_NAME = "Import a world-info book";

/** The entry editor's depth switch. */
export const WORLD_INFO_DEPTH_SWITCH_NAME = "Inject at a depth in history";
export const WORLD_INFO_BOOK_DETAILS_NAME = "Book details";
export const WORLD_INFO_EDIT_DETAILS_NAME = "Edit details";

/** The World Info collection's group label on the Settings map. */
export const WORLD_INFO_GROUP_LABEL = "World Info";

/** The entry editor's keyword, priority and fire-mode fields. */
export const WORLD_INFO_KEYWORD_TRIGGERS_NAME = "Keyword triggers";
export const WORLD_INFO_PRIORITY_NAME = "Priority";
export const WORLD_INFO_FIRE_MODE_NAME = "Fire mode";

/** The book editor's personas attachment section, counting the personas that attach the book. */
export const WORLD_INFO_ATTACHED_BY_PERSONAS_LEAD = "Attached by personas";
export function worldInfoAttachedByPersonasKicker(count: number): string {
  return `${WORLD_INFO_ATTACHED_BY_PERSONAS_LEAD} · ${String(count)}`;
}

/** The entry editor's fields. */
export const WORLD_INFO_ENTRY_TITLE_NAME = "Title";
export const WORLD_INFO_ENTRY_CONTENT_NAME = "Content";
export const WORLD_INFO_ENTRY_NOTE_NAME = "Note";
export const WORLD_INFO_ENTRY_DEPTH_NAME = "Depth";
export const WORLD_INFO_ENTRY_ROLE_NAME = "Role";
export const WORLD_INFO_ENTRY_PLACEMENT_NAME = "Placement";

/** The book details dialog's description field. */
export const WORLD_INFO_BOOK_DESCRIPTION_NAME = "Description";

/** The book editor's create-entry verb, which is also the new entry's starting title. */
export const WORLD_INFO_NEW_ENTRY_NAME = "New entry";

/** The empty book's own door to its first entry; the book's header verb keeps the bare name. */
export function worldInfoNewEntryInName(bookName: string): string {
  return `${WORLD_INFO_NEW_ENTRY_NAME} in ${bookName}`;
}

/** The book editor's empty state. */
export const WORLD_INFO_NO_ENTRIES_TITLE = "No entries yet";

/** The entry editor's delete door, named for the entry. */
export function worldInfoEntryDeleteName(entry: string): string {
  return `Delete ${entry}`;
}
