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

/** The add dialog's source modes, its attach group and its link press. */
export const DATABANK_UPLOAD_FILE_NAME = "Upload a file";
export const DATABANK_FROM_LINK_NAME = "From a link";
export const DATABANK_ATTACH_GROUP_NAME = "Use this document in";
export const DATABANK_FETCH_ADD_NAME = "Fetch and add";

/** The link press's name, by whether the fetch is running. */
export function databankFetchAddLabel(fetching: boolean): string {
  return fetching ? "Fetching…" : DATABANK_FETCH_ADD_NAME;
}

/** The document detail's section kickers, and the one press and hint under the Maintenance kicker. */
export const DATABANK_DETAIL_MAINTENANCE_KICKER = "Maintenance";
export const DATABANK_DETAIL_SOURCE_KICKER = "Source text";
export const DATABANK_REBUILD_HINT = "Use this after a settings change, or if search misses this document.";
export const DATABANK_REBUILD_DOCUMENT_NAME = "Rebuild search index for this document";

/** The context pane's active-in block when nothing attaches the document, and its title once the document is gone. */
export const DATABANK_NOWHERE_YET_TEXT = "Nowhere yet: attach it to one of your characters, or from a chat's Databank panel.";
export const DATABANK_DOCUMENT_NOT_FOUND_TITLE = "Document not found";

/** The list header's recheck of the bank, as a menu item and as a menu row. */
export const DATABANK_CHECK_AGAIN_NAME = "Check the bank again";

/** The owner sweeps' confirm presses: the sweep itself, and the banner button that asks for the second. */
export const DATABANK_REBUILD_NAME = "Rebuild";
export const DATABANK_REREAD_NAME = "Re-read";

/** The library list. */
export const DATABANK_LIST_NAME = "Documents";

/** The library and Home tile empty state before any document exists. */
export const DATABANK_EMPTY_TITLE = "No documents yet";

/** The maintenance command that rebuilds every document's search index. */
export const DATABANK_REBUILD_ALL_NAME = "Rebuild all documents";

/** The maintenance command that reads every uploaded file again. */
export const DATABANK_REREAD_ALL_NAME = "Re-read all documents";

/** A maintenance command's confirm, titled as the command's own question. */
export function databankSweepConfirmTitle(command: string): string {
  return `${command}?`;
}

/** The empty Home tile's door into the section, named for it. */
export function databankOpenSectionName(section: string): string {
  return `Open ${section}`;
}
