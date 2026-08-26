// Line/column (both 1-based, Stryker's convention) to an absolute string offset. Kept pure and separate
// because an off-by-one here silently plants the mutant one character out — which reads as a survivor
// rather than as a broken probe.

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

/** Throws rather than clamping: a location outside the source means the report and the file disagree. */
export function offsetOf(starts: readonly number[], loc: SourceLocation): number {
  const start = starts[loc.line - 1];
  if (start === undefined) {
    throw new Error(`location line ${loc.line} is past the end of the source (${starts.length} lines)`);
  }
  return start + (loc.column - 1);
}
