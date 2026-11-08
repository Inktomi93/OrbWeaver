// The stamp line under a Recently chatted face.
import { timeLib } from "#lib";

const NO_BREAK_SPACE_CODE_POINT = 0xa0;
const NO_BREAK_SPACE = String.fromCodePoint(NO_BREAK_SPACE_CODE_POINT);

/** "chatted 3h ago · 4 chats". `formatRelativeAgo` is the SENTENCE form (a column stamp would be `2h`), and
 *  it is the form that freezes under `--probe` so a snapshot diff is not a clock diff. `chatCount` is never
 *  null — a join miss and a zero are the same fact — so the plural is the only branch.
 *
 *  The separator and the count are joined with no-break spaces so the stamp wraps before the "·" and never
 *  after it: a line that ends on the separator reads as a fragment of the count under it. */
export function chattedStamp(lastChattedAt: number, chatCount: number): string {
  const threads = chatCount === 1 ? "1 chat" : `${chatCount} chats`;
  return `chatted ${timeLib.formatRelativeAgo(lastChattedAt)} ·${NO_BREAK_SPACE}${threads.replace(" ", NO_BREAK_SPACE)}`;
}
