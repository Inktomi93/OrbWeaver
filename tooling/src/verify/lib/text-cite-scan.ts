// The ONE offset→authored-position reader for a TEXT-SCAN policy — the shared computation of the
// citation family (`d-citation-integrity`, `pd-citation-integrity`, `dangling-doc-cite`).
//
// WHY IT IS SHARED AND NOT THREE SPELLINGS. All three judge a lexeme found by scanning RAW TEXT rather
// than by visiting a node, so none of them has a node to report and none can use the node overload's
// derived position (`lib/policy-pass-context.ts`, which scans a NODE's text). Under the legacy runtime
// each computed its own line — two through `getLineAndColumnAtPos`, one through `split("\n").length` —
// and two of the three then reported `column: 0`. That is harmless for a jump link and FATAL for an
// ordinary waiver: `locateFinding` (`lib/ordinary-waiver.ts`) requires the finding's token to be the
// authored text at its EXACT line and column, so a finding whose column is a placeholder has no waiver
// door at all while looking like it has one. One reader means one answer, and the answer IS the waiver
// position.
//
// THE TOKEN IS GROUP 1 WHEN THE PATTERN HAS ONE. A scan pattern usually needs context the token is not
// (`^|\s*` before a registry row, a lookbehind before a citation), so the whole match is the wrong
// waiver position. Capturing the exact lexeme and locating it INSIDE the match is what keeps the
// reported position spellable by the author: `PD-7`, not `| PD-7`.
//
// LINE STARTS ARE PRECOMPUTED. A per-match `slice(0, offset).split("\n")` is quadratic in the file, and
// the registry documents this family scans are the largest Markdown files in the corpus.

/** One scanned lexeme with the coordinates an ordinary waiver binds to. `line`/`column` are 1-based. */
export interface TextCitation {
  readonly token: string;
  readonly line: number;
  readonly column: number;
}

function lineStarts(text: string): readonly number[] {
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

/** The 1-based line holding `offset`, by binary search over the line starts. */
function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] as number) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

/** Every match of `pattern` in `text`, as the exact authored token plus its 1-based line/column.
 *  `pattern` MUST be global — a non-global pattern silently yields one match forever under `matchAll`,
 *  which is a scanner that reads clean on a file full of violations. */
export function scanTextCitations(text: string, pattern: RegExp): readonly TextCitation[] {
  if (!pattern.global) {
    throw new Error(`text citation pattern must be global: ${pattern.source}`);
  }
  const starts = lineStarts(text);
  const found: TextCitation[] = [];
  for (const match of text.matchAll(pattern)) {
    const whole = match[0];
    const token = match[1] ?? whole;
    const within = match[1] === undefined ? 0 : whole.indexOf(match[1]);
    const offset = match.index + within;
    const line = lineAt(starts, offset);
    found.push(Object.freeze({ token, line, column: offset - (starts[line - 1] as number) + 1 }));
  }
  return Object.freeze(found);
}
