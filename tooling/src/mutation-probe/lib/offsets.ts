// Line/column (both 1-based, Stryker's convention) to an absolute string offset. Kept pure and separate
// because an off-by-one here silently plants the mutant one character out — which reads as a survivor
// rather than as a broken probe.
//
// EVERY BOUND IS CHECKED, AND A BAD ONE IS A REFUSAL (#1509 item 2). The report is another tool's JSON:
// its locations are an input, not a fact. A column below 1 produces a NEGATIVE index, which `String.slice`
// silently reinterprets from the END of the file; a column past the line's own end slices into the NEXT
// line. Either plants the mutant at the wrong byte, and the file's own premise — "an off-by-one reads as a
// SURVIVOR" — makes that a FALSE NEGATIVE for the whole mutation verdict, the one failure this tool exists
// to remove. So the range is validated here, once, and an impossible location throws (exit-2 class: the
// probe could not measure) instead of producing a plausible-looking receipt.

/** Absolute offsets of each line start, index 0 = line 1. */
export function lineStarts(source: string): readonly number[] {
  const starts = [0];
  let at = source.indexOf("\n");
  while (at !== -1) {
    starts.push(at + 1);
    at = source.indexOf("\n", at + 1);
  }
  return starts;
}

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

/** A report's half-open `[start, end)` span for one mutant. */
export interface SourceRange {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
}

/** Throws rather than clamping: a location outside the source means the report and the file disagree, and
 *  a clamped plant is a measurement of a byte nobody asked about. `sourceLength` is what bounds the LAST
 *  line, which the line-start table alone cannot express. */
export function offsetOf(starts: readonly number[], loc: SourceLocation, sourceLength: number): number {
  const start = starts[loc.line - 1];
  if (start === undefined) {
    throw new Error(`location line ${String(loc.line)} is past the end of the source (${String(starts.length)} lines)`);
  }
  if (!Number.isInteger(loc.column) || loc.column < 1) {
    throw new Error(`location column ${String(loc.column)} at line ${String(loc.line)} is not a 1-based column`);
  }
  const offset = start + (loc.column - 1);
  // The next line's start is the character AFTER this line's newline, so the last addressable offset on
  // this line is one before it. An end location may sit exactly at the line end, hence `>`.
  const nextStart = starts[loc.line];
  const lineEnd = nextStart === undefined ? sourceLength : nextStart - 1;
  if (offset > lineEnd) {
    throw new Error(
      `location ${String(loc.line)}:${String(loc.column)} is past the end of its own line (${String(lineEnd - start + 1)} columns) — the report and the file disagree`,
    );
  }
  return offset;
}

/** The plant's byte range. Validates BOTH ends and their order in one place, so no caller can slice with
 *  an unchecked pair. */
export function offsetRangeOf(source: string, starts: readonly number[], range: SourceRange): { readonly from: number; readonly to: number } {
  const from = offsetOf(starts, range.start, source.length);
  const to = offsetOf(starts, range.end, source.length);
  if (to < from) {
    throw new Error(
      `mutant range ends before it starts (${String(range.start.line)}:${String(range.start.column)} → ${String(range.end.line)}:${String(range.end.column)}) — the report and the file disagree`,
    );
  }
  return { from, to };
}
