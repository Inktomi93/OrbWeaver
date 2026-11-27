// What the composer says when a send fails: the toast for a send the room never took, and the line under the composer
// for a send whose message landed but whose reply did not. A zero-import leaf, so a test reads the same words the
// product prints.

export const SEND_FAILED_TITLE = "Couldn't send your message.";

/** The lead of a failed reply no message of this client's own sent: the empty-Enter reply and the composer's Generate reply. */
export const REPLY_NOT_WRITTEN_LEAD = "Couldn't write the reply.";

/** The lead of a swipe that failed. */
export const SWIPE_FAILED_LEAD = "Couldn't generate that swipe.";

/** The lead of a summoned member who could not speak. */
export const SUMMON_FAILED_LEAD = "Couldn't summon that member to speak.";

/** The reply-failure line's lead: the message is in the room, the reply is not. */
export const REPLY_FAILED_LEAD = "Your message is saved, but the reply failed.";

/** A member's reason when the host's connection failed: the member cannot fix it, and is not shown the host's
 *  account detail. The send gate's host causes use the same "Ask them" voice. */
export const HOST_CONNECTION_FAILED_COPY = "The host's connection couldn't answer. Ask them to check it.";

/** The line's action that asks for the reply again on the saved message. */
export const RETRY_REPLY_NAME = "Retry the reply";

/** The line's door to the connection settings, for a failure the connection's owner fixes there. */
export const OPEN_CONNECTIONS_NAME = "Open Connections";

/** The reset clause after a rate-limited provider's sentence, given the reset moment already formatted. */
export function providerResetsLabel(resetAt: string): string {
  return `The limit resets ${resetAt}.`;
}
