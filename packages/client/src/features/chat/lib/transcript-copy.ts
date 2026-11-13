/** Printed in place of the paging controls when the loaded rows are not the whole room. */
export const CHAT_PRINT_COVERAGE = "This print covers the messages loaded in the room. Load the rest before printing to include them.";

/** The pager's status line while older pages remain, which is also the Earlier messages description. */
export const CHAT_HISTORY_PAGER_HINT = "Load older conversation history without moving your reading position.";

/** The pager's status line once no older page remains. */
export const CHAT_HISTORY_BEGINNING = "Beginning of available history.";

/** The anchored window's paging description: why Earlier or Later can be unavailable. */
export const CHAT_WINDOW_PAGING_HINT = "Earlier and Later stop at either end of the conversation, and while a page loads.";

/** What a room opened from a Corpus source says about the moment it was asked for, by the source's outcome. */
export const CORPUS_SOURCE_OUTCOME_COPY = {
  resolved: "Opened the exact source moment.",
  moved: "The source changed. Opened its surviving source anchor or visible original range.",
  deleted: "The source moment was deleted. Opened the room without an exact jump.",
  unavailable: "The source anchor is unavailable. Opened the room without an exact jump.",
} as const;

/** The status line's count of the rows paged in so far. */
export function chatHistoryLoadedLabel(count: number): string {
  return `${String(count)} messages loaded.`;
}

/** The jump pill's visible count of the replies that arrived below the reading position. */
export function jumpToLatestCountLabel(held: number): string {
  return held === 1 ? "1 new message" : `${String(held)} new messages`;
}

/** The words the jump pill's name opens with, before its count. */
export const JUMP_TO_LATEST_LEAD = "Jump to latest";

/** The jump pill's accessible name. */
export function jumpToLatestName(held: number): string {
  return `${JUMP_TO_LATEST_LEAD}, ${jumpToLatestCountLabel(held)}`;
}
