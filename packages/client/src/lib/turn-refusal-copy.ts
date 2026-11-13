// What a refused turn says, for every turn-starting mutation (`turnMutationToast`), and what the composer says before a
// send the room would refuse. A zero-import leaf, so a test reads the same words the product prints. The two
// room-state lines follow the dropped-reply notice's voice.

/** Another reply holds the room's turn lock: retryable, and nothing was changed. */
export const TURN_LOCKED_COPY = "Another reply is still generating in this room. Nothing was changed. Try again once it finishes.";

/** The room is being removed, so it will not come back. */
export const TURN_ROOM_CLOSING_COPY = "That chat is no longer available. Nothing was changed.";

/** The room's host is unavailable. It never says why: a member is not told another account's state. The composer's
 *  disabled Send states it alone, since nothing was attempted yet. */
export const HOST_UNAVAILABLE_COPY = "The host is unavailable.";

/** A turn refused for that host state. */
export const TURN_HOST_UNAVAILABLE_COPY = `${HOST_UNAVAILABLE_COPY} Nothing was changed.`;
