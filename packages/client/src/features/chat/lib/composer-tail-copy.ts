// What the line under the composer says about a room's unanswered tail: who a wait-for-everyone room still waits on,
// or that the last message has no reply yet. A zero-import leaf, so a spec reads the words the product prints.

/** The word the waiting line uses for the viewer in place of their own name. */
export const WAITING_VIEWER_WORD = "you";

/** The waiting line: the people who have not written since the last reply, in roster order. */
export function waitingForLabel(names: readonly string[]): string {
  const list = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
  return `Waiting for ${list} to write.`;
}

/** The waiting line's action that starts the reply before everyone has written. */
export const REPLY_NOW_NAME = "Reply now";

/** The line's lead when the last message is a person's and nothing answered it. */
export const NO_REPLY_YET_LEAD = "No reply yet.";
