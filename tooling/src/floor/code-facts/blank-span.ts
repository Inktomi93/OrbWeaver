// Blank text to spaces in place, keeping every newline and the UTF-16 length, so a line or column read off the
// blanked text still names the authored position. One space per UTF-16 unit: a `u`-flag match is a whole code
// point, and an astral one (an emoji) is two units long.

const SPACE = " ";

export function blankText(text: string): string {
  return text.replace(/[^\n]/gu, (char) => SPACE.repeat(char.length));
}

/** `text` with `[start, end)` blanked. */
export function blankSpan(text: string, start: number, end: number): string {
  return text.slice(0, start) + blankText(text.slice(start, end)) + text.slice(end);
}
