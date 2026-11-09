// The accessible names the This-chat tab's attach doors and pickers print. A zero-import leaf, so a spec's node side reads
// them without loading the component graph.

/** The World books section's door to its picker. */
export const CHAT_ATTACH_BOOK_NAME = "Attach a world book";

/** The Regex section's door to the room tier's picker. */
export const CHAT_ATTACH_SCRIPT_NAME = "Attach a script";

/** The Documents section's door to the bank picker. */
export const CHAT_ADD_FROM_BANK_NAME = "Add from your bank";

/** The script picker's commit. */
export const CHAT_ATTACH_SCRIPTS_COMMIT_NAME = "Attach to this chat";

/** One book or script row's attach control in a picker. */
export function chatAttachItemName(name: string): string {
  return `Attach ${name} to this chat`;
}

/** What the book picker reads, as its failed-read sentence names it. */
export const CHAT_BOOK_PICKER_READ = "your world books";

/** What the bank picker reads, as its failed-read sentence names it. */
export const CHAT_DOCUMENT_PICKER_READ = "your documents";

/** The book picker's empty state when the caller owns no book. */
export const CHAT_BOOK_PICKER_EMPTY_TITLE = "You have no world books yet";

/** The bank picker's empty state when the caller owns no document. */
export const CHAT_BANK_EMPTY_TITLE = "Your bank is empty";

/** The bank picker's search field. */
export const CHAT_DOCUMENT_SEARCH_NAME = "Search your documents";

/** A refused book attach, in the picker and in its toast. */
export const CHAT_ATTACH_BOOK_FAILURE = "Couldn't attach the world book to this chat.";

/** A refused script attach, in the picker. */
export const CHAT_ATTACH_SCRIPTS_FAILURE = "Couldn't attach those scripts to this chat.";
