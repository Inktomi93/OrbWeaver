// What the inbox says and the names its controls carry. A zero-import leaf, so a test reads the same words the bell,
// its rows and the handoff confirm print.

/** The drain dropped the turn because its frozen host is disabled or gone from the room. It does not say the host
 *  refused: no host was asked. */
export const DEFERRED_TURN_HOST_UNAVAILABLE_COPY = "An AI reply couldn't run. The host is unavailable";

/** The room, or its host seat, no longer exists. */
export const DEFERRED_TURN_CHAT_GONE_COPY = "An AI reply couldn't run. That chat is no longer available";

/** The row copy of a `kicked` notification. */
export const KICKED_ROW_COPY = "You were removed from a chat";

/** The bell's name with nothing unread, and the lead of every name it takes with a count. */
export const NOTIFICATIONS_BELL_NAME = "Notifications";

/** The mark after a count that is a floor: more pages sit below the loaded ones. */
export const NOTIFICATIONS_UNREAD_FLOOR_MARK = "+";

/** The bell's name. Counts cover the loaded pages, so with more below the count is a floor and the name says so. */
export function notificationsBellLabel(unreadCount: number, hasNextPage: boolean): string {
  return unreadCount === 0
    ? NOTIFICATIONS_BELL_NAME
    : `${NOTIFICATIONS_BELL_NAME} (${String(unreadCount)}${hasNextPage ? NOTIFICATIONS_UNREAD_FLOOR_MARK : ""} unread)`;
}

/** The empty inbox's title. */
export const INBOX_CAUGHT_UP_TITLE = "You're all caught up";

/** The dismissed list's press while it is closed. */
export const SHOW_DISMISSED_LABEL = "Show dismissed";

/** The dismissed list's press, by whether the list is open. */
export function dismissedToggleLabel(open: boolean): string {
  return open ? "Hide dismissed" : SHOW_DISMISSED_LABEL;
}

/** The next page of active rows. */
export const LOAD_MORE_LABEL = "Load more";
/** The next page of dismissed rows. It differs from the active one because both share the popup. */
export const LOAD_MORE_DISMISSED_LABEL = "Load more dismissed";

/** The lead of an invite row's Accept name. */
const ACCEPT_INVITATION_NAME_LEAD = "Accept invitation from";

/** The lead of an invite row's Decline name, before the inviter's handle. */
export const DECLINE_INVITATION_NAME_LEAD = "Decline invitation from";

export function acceptInvitationName(inviterHandle: string): string {
  return `${ACCEPT_INVITATION_NAME_LEAD} ${inviterHandle}`;
}

export function declineInvitationName(inviterHandle: string): string {
  return `${DECLINE_INVITATION_NAME_LEAD} ${inviterHandle}`;
}

/** A handoff nomination's Accept, which opens the disclosure confirm. */
export const ACCEPT_HANDOFF_NAME = "Accept the host handoff";

/** The consent ask's Review, which opens the Plugins group. */
export const REVIEW_PLUGIN_CONSENT_NAME = "Review what your plugins ask for";

export function openPluginsName(pluginName: string): string {
  return `Open Plugins, ${pluginName}`;
}

/** The lead of every row's Dismiss name, before the row's own copy. */
export const DISMISS_NAME_LEAD = "Dismiss:";

export function dismissRowName(rowCopy: string): string {
  return `${DISMISS_NAME_LEAD} ${rowCopy}`;
}

/** The handoff confirm's title. */
export const HANDOFF_ACCEPT_CONFIRM_TITLE = "Accept hosting this chat?";

/** What the confirm says when the nomination copies nothing into the nominee's library. */
export const HANDOFF_NOTHING_COPIED_DESCRIPTION = "You become the host of this chat. Nothing is copied into your library.";
