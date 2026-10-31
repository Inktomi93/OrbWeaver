// domain/chat/substrate/reaction-note — the attribution note a reaction writes into the model's prompt. Zero imports, so the
// contribution that writes it and the suites that must collide with it read one builder.

/** The reactor name for a seat that has neither a character nor a persona name. */
export const REACTION_ANONYMOUS_REACTOR = "A member";

/** The target of a reaction that anchors to no segment of the message. */
export const REACTION_WHOLE_MESSAGE_TARGET = "the message";

/** `[<reactor> reacted with <emoji> to <target>: "<quoted>"]`. */
export function reactionNote(reactor: string, emoji: string, target: string, quoted: string): string {
  return `[${reactor} reacted with ${emoji} to ${target}: "${quoted}"]`;
}
