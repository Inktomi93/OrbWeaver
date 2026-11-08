// The accessible names the Databank library, Home tile and add dialog print. A zero-import leaf, so a spec's node side
// reads them without loading the component graph.

/** The Home tile's empty-bank door to the add dialog. */
export const DATABANK_ADD_FIRST_DOCUMENT_NAME = "Add your first document";

/** The Home tile's trailing door to the library. */
export const DATABANK_ALL_DOCUMENTS_NAME = "All documents";

/** The CONTENT pane's heading on the landing, empty bank or not. */
export const DATABANK_LANDING_NAME = "Your databank";

/** The library's search box. */
export const DATABANK_SEARCH_NAME = "Search documents";

/** The context body's switch for the same act. */
export const DATABANK_USE_IN_EVERY_CHAT_NAME = "Use in every chat";

/** The add dialog's paste choice. */
export const DATABANK_PASTE_TEXT_NAME = "Paste text";
export const DATABANK_RECENT_DOCUMENTS_NAME = "Recent documents";
export const DATABANK_DOCUMENT_NAME_FIELD_NAME = "Document name";
export const DATABANK_RENAME_NAME = "Rename document";
export const DATABANK_MAINTENANCE_NAME = "Databank maintenance";
export const DATABANK_VIEW_SOURCE_NAME = "View source text";
export const DATABANK_HIDE_SOURCE_NAME = "Hide source text";

/** The source-text toggle's name for its current state. */
export function databankSourceToggleName(shown: boolean): string {
  return shown ? DATABANK_HIDE_SOURCE_NAME : DATABANK_VIEW_SOURCE_NAME;
}

/** The add dialog's title, and the list header menu item that opens it. */
export const DATABANK_ADD_DOCUMENT_TITLE = "Add a document";

/** The list header's add door and the add dialog's submit. */
export const DATABANK_ADD_NAME = "Add";

/** The add dialog's method choice group. */
export const DATABANK_ADD_METHOD_NAME = "How to add the document";
export const DATABANK_ADD_NAME_FIELD_NAME = "Name";
export const DATABANK_ADD_TEXT_FIELD_NAME = "Text";

/** The library list. */
export const DATABANK_LIST_NAME = "Documents";

/** The library and Home tile empty state before any document exists. */
export const DATABANK_EMPTY_TITLE = "No documents yet";
