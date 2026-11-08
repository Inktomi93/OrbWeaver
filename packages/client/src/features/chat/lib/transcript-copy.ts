/** Printed in place of the paging controls when the loaded rows are not the whole room. */
export const CHAT_PRINT_COVERAGE = "This print covers the messages loaded in the room. Load the rest before printing to include them.";

/** The pager's status line while older pages remain, which is also the Earlier messages description. */
export const CHAT_HISTORY_PAGER_HINT = "Load older conversation history without moving your reading position.";

/** The pager's status line once no older page remains. */
export const CHAT_HISTORY_BEGINNING = "Beginning of available history.";

/** The status line's count of the rows paged in so far. */
export function chatHistoryLoadedLabel(count: number): string {
  return `${String(count)} messages loaded.`;
}
