// Where the browser breaks a run of text into lines, read from its own layout.

/** The soft hyphen: a break point a word offers, painted as a hyphen only where a line ends on it. */
export const SOFT_HYPHEN = "­";

/** The first character of a line after the first, and the character before it. */
export interface LineStart {
  readonly offset: number;
  readonly previous: string;
}

/**
 * Every character of `root`'s first text node that starts a line after the first. Pass it to `locator.evaluate`; it runs in the page, so it reads
 * nothing from this module. A soft hyphen has no box of its own and is skipped.
 */
export function lineStarts(root: Element): LineStart[] {
  const text = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode();
  if (text === null) {
    throw new Error("The element holds no text");
  }
  const content = text.textContent ?? "";
  const range = document.createRange();
  const starts: LineStart[] = [];
  let lineTop: number | undefined;
  for (let offset = 0; offset < content.length; offset++) {
    if (content[offset] === "­") {
      continue;
    }
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    // A character after a soft hyphen that broke the line has two rects: the painted hyphen ending the line above and the character itself. The last is the character's.
    const box = Array.from(range.getClientRects()).at(-1) ?? range.getBoundingClientRect();
    if (lineTop !== undefined && box.top > lineTop + box.height / 2) {
      starts.push({ offset, previous: content[offset - 1] ?? "" });
    }
    lineTop = box.top;
  }
  return starts;
}
