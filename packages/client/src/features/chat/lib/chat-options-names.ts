// The room options menu's static item names that its CT locates by role and name. A `.ts` leaf because a CT
// spec's node side cannot import a value out of a `.tsx` (the `message-action-names.ts` precedent).

/** The fork's way back: opens the chat this one was forked from. */
export const BACK_TO_PARENT_CHAT_LABEL = "Back to parent chat";

/** The room menu's destructive item, named for the room it deletes. */
export const CHAT_DELETE_NAME = "Delete chat";

/** The room menu's door into bulk message selection. */
export const CHAT_SELECT_MESSAGES_NAME = "Select messages…";
