// The accessible names the Members panel, its row menus, the member card viewer and the join dialog print. A
// zero-import leaf, so a spec's node side reads them without loading the component graph.

/** The Members panel's door to the invite dialog. */
export const CHAT_INVITE_PEOPLE_NAME = "Invite people";

/** The Members panel's door to the add-character picker, and that picker's name. */
export const CHAT_ADD_CHARACTER_NAME = "Add a character";

/** The add-character picker's search placeholder. */
export const CHAT_ADD_CHARACTER_PLACEHOLDER = "Search characters…";

/** A character row's menu item that opens the member card viewer. */
export const MEMBER_VIEW_CHARACTER_NAME = "View character";

/** A cast row's accessible name: the character, then its state. */
export function memberCharacterRowName(name: string, muted: boolean): string {
  return `${name}: character${muted ? ", muted" : ""}`;
}

/** A character row's menu item that opens the talkativeness popover. */
export const MEMBER_TALKATIVENESS_NAME = "Talkativeness…";

/** A person row's menu item that opens the kick confirm. */
export const MEMBER_KICK_NAME = "Kick…";

/** The card viewer's gone state: the character left, or access was revoked. */
export const MEMBER_CARD_GONE_TITLE = "This card isn't available";

/** What the card viewer reads, as its failed-read sentence names it. */
export const MEMBER_CARD_READ = "this character card";

/** The join dialog's line while the invite is checked. */
export const JOIN_CHECKING_TEXT = "Checking the invite…";

/** The join dialog's commit. */
export const JOIN_CHAT_NAME = "Join chat";

/** The join dialog's dismiss while a valid invite waits. */
export const JOIN_NOT_NOW_NAME = "Not now";

/** The invite dialog's list of live invites. */
export const INVITE_OUTSTANDING_HEADING = "Outstanding invites";

/** What that list reads, as its failed-read sentence names it. */
export const INVITE_OUTSTANDING_READ = "the outstanding invites";

/** The invite dialog's handle mode and the submit that mode shows. */
export const INVITE_BY_HANDLE_NAME = "Invite by handle";
export const INVITE_SEND_NAME = "Send invite";

/** An outstanding invite's revoke control, named for the kind of invite and who it is for (`target` is empty for a share link). */
export function inviteRevokeName(kind: string, target: string): string {
  return `Revoke this ${kind.toLowerCase()}${target}`;
}

/** The invite dialog's inline refusal when a handle names no invitable user. */
export const INVITE_TARGET_UNKNOWN_TEXT = "No invitable user with that exact handle.";

/** The invite landing dialog's title. */
export const JOIN_DIALOG_TITLE = "Join a chat";

/** A character row's menu item that takes the character out of the room. */
export function memberRemoveName(characterName: string): string {
  return `Remove ${characterName} from chat`;
}
