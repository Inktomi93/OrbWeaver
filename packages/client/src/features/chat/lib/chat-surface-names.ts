// The accessible names the chat list, composer, gallery picker and message confirms print. A zero-import leaf, so a spec's
// node side reads them without loading the component graph.

/** The verb on a room override's clear control and its confirm. */
export const OVERRIDE_CLEAR_VERB = "Clear";

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
export const CHAT_HISTORY_DISMISS_NAME = "Dismiss";
export const CHAT_HISTORY_FAILURE_COPY = {
  press: "Couldn't load earlier messages.",
  refresh: "Couldn't refresh these messages.",
  bridge: "Couldn't load the messages between here and the latest.",
  offline: "You're offline. History will load when you're back.",
} as const;
export const CHAT_WINDOW_PRESS_FAILURE = "Couldn't load more messages.";
/** What the room's read failure calls the room, `queryFailedLabel(CHAT_ROOM_READ_LABEL)`. */
export const CHAT_ROOM_READ_LABEL = "this conversation";
export const CHAT_SAVED_ROSTER_DOOR_NAME = "Start from a saved roster";

/** New chat's pinned cue where the dialog has no room to pin Blank chat with Start, so it sits after them. */
export const CHAT_MORE_BELOW_CUE = "More below";
export const CHAT_EXPORT_TRANSCRIPT_NAME = "Export transcript";
export const CHAT_MESSAGE_INPUT_NAME = "Message";
export const CHAT_COMPOSER_NAME = "Message composer";
export const CHAT_SEND_NAME = "Send message";
export const CHAT_STOP_NAME = "Stop generating";

/** The stop control's tooltip while a stop is pending or available. */
export function chatStopTooltip(stopping: boolean): string {
  return stopping ? "Stopping generation" : CHAT_STOP_NAME;
}

/** The chat list's empty state before any room exists. */
export const CHAT_LIST_EMPTY_TITLE = "No chats yet";

/** A chat row's actions trigger, named for the row's disambiguated subject. */
export function chatRowActionsName(rowName: string): string {
  return `Chat actions for ${rowName}`;
}

export const CHAT_STAR_NAME = "Star";
export const CHAT_UNSTAR_NAME = "Unstar";
export const CHAT_ARCHIVE_NAME = "Archive";
const CHAT_UNARCHIVE_NAME = "Unarchive";

/** The row menu's star toggle for the room's current state. */
export function chatStarToggleName(starred: boolean): string {
  return starred ? CHAT_UNSTAR_NAME : CHAT_STAR_NAME;
}

/** The row menu's archive toggle for the room's current state. */
export function chatArchiveToggleName(archived: boolean): string {
  return archived ? CHAT_UNARCHIVE_NAME : CHAT_ARCHIVE_NAME;
}

/** The corrections dialog's instruction field. */
export const CHAT_CORRECTION_INSTRUCTION_NAME = "Correction instruction";

/** One stored variant in the saved-replies picker, by its one-based ordinal. */
export function savedReplyOptionName(ordinal: number, current: boolean): string {
  return `Reply ${String(ordinal)}${current ? " (current)" : ""}`;
}

/** The reaction picker's choice for one emoji. */
export function reactionChoiceName(emoji: string): string {
  return `React with ${emoji}`;
}

/** A message's reaction pill, which also names the line's author when the room has several. */
export function reactionPillName(emoji: string, count: number, qualifier: string | null): string {
  const choice = qualifier === null ? reactionChoiceName(emoji) : `${reactionChoiceName(emoji)} to ${qualifier}'s line`;
  return `${choice}: ${String(count)} so far`;
}

/** The wire viewer's empty state for a reply that captured no prompt. */
export const WIRE_NO_PROMPT_TITLE = "No prompt was captured for this reply";
export const WIRE_STATIC_PREFIX_HEADING = "Static prefix";
export const WIRE_AUTHORED_TEXT_HEADING = "Authored text, before transforms";

/** The character gallery's empty state and its add door. */
export const CHAT_GALLERY_EMPTY_TITLE = "No images yet";
export const CHAT_GALLERY_ADD_NAME = "Add images";

/** The gallery add-picker's title. */
export const CHAT_GALLERY_ADD_PICKER_TITLE = "Add images to the gallery";

/** The character gallery dialog, named for its character. */
export function characterGalleryName(characterName: string): string {
  return `${characterName}'s gallery`;
}

/** The chats-with-character pane's list, named for its character. */
export function chatsWithCharacterName(characterName: string): string {
  return `Chats with ${characterName}`;
}

/** The Home quick-picks tile's door to the character library. */
export const CHAT_ALL_CHARACTERS_NAME = "All characters";

/** A chat injection row's text field. */
export const CHAT_INJECTION_CONTENT_NAME = "Content";

/** The members panel's roster toolbar. */
export const CHAT_MEMBERS_ROSTER_NAME = "Members and characters";

/** The open room's Members entry: a fixed prefix, then the member count. */
export const CHAT_MEMBERS_ENTRY_PREFIX = "Members: ";
export function chatMembersEntryName(count: number): string {
  return `${CHAT_MEMBERS_ENTRY_PREFIX}${count}`;
}

/** Home's hearth island, named for the room it resumes. */
export function homeResumeChatName(title: string): string {
  return `Resume ${title}`;
}

/** A Home quick pick's door to a fresh room with that character. */
export function homeNewChatWithName(character: string): string {
  return `New chat with ${character}`;
}

/** Home's list of character quick picks. */
export const HOME_QUICK_PICKS_NAME = "Character quick-picks";

/** The new-chat picker's character field. */
export const NEW_CHAT_CHARACTERS_FIELD_NAME = "Choose characters";

/** The transcript's message log. */
export const CHAT_TRANSCRIPT_NAME = "Conversation messages";
