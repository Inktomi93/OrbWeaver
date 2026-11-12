// What the inbox says about a queued AI reply that was dropped. A zero-import leaf, so a test reads the same
// words the row prints.

/** The drain dropped the turn because its frozen host is disabled or gone from the room. It does not say the host
 *  refused: no host was asked. */
export const DEFERRED_TURN_HOST_UNAVAILABLE_COPY = "An AI reply couldn't run. The host is unavailable";

/** The room, or its host seat, no longer exists. */
export const DEFERRED_TURN_CHAT_GONE_COPY = "An AI reply couldn't run. That chat is no longer available";
