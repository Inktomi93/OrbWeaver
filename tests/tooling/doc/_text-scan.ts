// Every match of a global pattern in a text, as the exact lexeme plus its 1-based line and column.
// Group 1 is the lexeme when the pattern has one, so a lookbehind never widens the reported position.

export interface TextHit {
  readonly token: string;
  readonly line: number;
  readonly column: number;
}

export function scanText(text: string, pattern: RegExp): readonly TextHit[] {
  if (!pattern.global) {
    throw new Error(`scan pattern must be global: ${pattern.source}`);
  }
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  const hits: TextHit[] = [];
  for (const match of text.matchAll(pattern)) {
    const whole = match[0];
    const token = match[1] ?? whole;
    const offset = match.index + (match[1] === undefined ? 0 : whole.indexOf(match[1]));
    const line = Math.max(
      0,
      lineStarts.findLastIndex((start) => start <= offset),
    );
    hits.push({ token, line: line + 1, column: offset - (lineStarts[line] ?? 0) + 1 });
  }
  return hits;
}
