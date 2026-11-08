// The room options menu's static item names that its CT locates by role and name. A `.ts` leaf because a CT
// spec's node side cannot import a value out of a `.tsx` (the `message-action-names.ts` precedent).

/** The fork's way back: opens the chat this one was forked from. */
export const BACK_TO_PARENT_CHAT_LABEL = "Back to parent chat";

/** The room menu's destructive item, named for the room it deletes. */
export const CHAT_DELETE_NAME = "Delete chat";

/** A member's way out of a room, in the room menu and on their Members row. */
export const CHAT_LEAVE_NAME = "Leave chat…";

/** The leave confirm's heading. */
export const CHAT_LEAVE_CONFIRM_TITLE = "Leave this chat?";

/** The leave confirm's body for a member, whose departure leaves the room standing. */
export const CHAT_LEAVE_MEMBER_NOTE = "You'll lose access until someone invites you again. Your messages stay.";

/** The room menu's door into bulk message selection. */
export const CHAT_SELECT_MESSAGES_NAME = "Select messages…";
