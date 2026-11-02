// The accessible names the chat list, composer, gallery picker and message confirms print. A zero-import leaf, so a spec's
// node side reads them without loading the component graph.

/** The chat list search box's clear button. */
export const CHAT_CLEAR_SEARCH_NAME = "Clear the search";

/** The composer's continue button, before the direction a typed line adds to it. */
export const CHAT_CONTINUE_REPLY_NAME = "Continue the reply";

/** The greeting strip's swipe-forward button. */
export const CHAT_NEXT_GREETING_NAME = "Next greeting";

/** The saved-replies picker's dialog title. */
export const CHAT_SAVED_REPLIES_NAME = "Saved replies";

/** The composer menu item that opens the saved-replies picker. */
export const CHAT_SAVED_REPLIES_DOOR_NAME = "Saved replies…";

/** The picker's variant select. */
export const CHAT_SAVED_REPLY_NAME = "Saved reply";

/** The send control's name while a stop is in flight. */
export const CHAT_STOPPING_NAME = "Stopping…";

/** The reattribute confirmation's title. */
export const CHAT_REATTRIBUTE_CONFIRM_TITLE = "Reattribute from here?";

/** The message delete confirmation's title. */
export const CHAT_DELETE_MESSAGE_TITLE = "Delete this message?";

/** The gallery add-picker's exit to the upload zone. */
export const CHAT_GALLERY_UPLOAD_INSTEAD_NAME = "Upload instead";

/** The gallery add-picker's image grid. */
export const CHAT_GALLERY_IMAGES_NAME = "Your images";

/** The Home also-open tile's door to the chat list. */
export const CHAT_ALL_CHATS_NAME = "All chats";

/** The reattribute confirmation's commit button. */
export const CHAT_REATTRIBUTE_CONFIRM_NAME = "Reattribute";
export const CHAT_CANCEL_EDIT_NAME = "Cancel edit";
export const CHAT_SAVE_EDIT_NAME = "Save edit";
export const CHAT_LIST_NAME = "Chats list";
export const CHAT_SEARCH_NAME = "Search chats";
export const CHAT_EARLIER_MESSAGES_NAME = "Earlier messages";
/** Printed in place of the paging controls when the loaded rows are not the whole room. */
export const CHAT_PRINT_COVERAGE = "This print covers the messages loaded in the room. Load the rest before printing to include them.";
export const CHAT_EXPORT_TRANSCRIPT_NAME = "Export transcript";
export const CHAT_MESSAGE_INPUT_NAME = "Message";
export const CHAT_COMPOSER_NAME = "Message composer";
export const CHAT_SEND_NAME = "Send message";
export const CHAT_STOP_NAME = "Stop generating";

/** The stop control's tooltip while a stop is pending or available. */
export function chatStopTooltip(stopping: boolean): string {
  return stopping ? "Stopping generation" : CHAT_STOP_NAME;
}
