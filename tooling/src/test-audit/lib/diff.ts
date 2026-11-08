// Reads `git diff -U0` output into the old-file lines each path lost or changed, and judges a range against them.
// Old-file coordinates are the record's own, so a range from a trace compares without any line mapping.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { ChangedLines, Hunk } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm test-audit <verb>");

const FILE_HEADER = /^diff --git a\/(.+) b\/.+$/u;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/u;

/** The changed hunks per old path. A path with no hunk (a mode change, a binary file) still counts as changed. */
export function changedLines(diff: string): ChangedLines {
  const changed = new Map<string, Hunk[]>();
  let current: Hunk[] | null = null;
  for (const line of diff.split("\n")) {
    const file = FILE_HEADER.exec(line);
    if (file !== null) {
      current = [];
      changed.set(file[1] ?? "", current);
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk !== null && current !== null) {
      current.push({ start: Number(hunk[1]), count: hunk[2] === undefined ? 1 : Number(hunk[2]) });
    }
  }
  return changed;
}

/** True when the diff touches lines `startLine..endLine` of `path`, or any line when the range is the whole file.
 *  An insertion between two lines of the range counts; one just before or after it does not. */
export function rangeChanged(changed: ChangedLines, path: string, startLine: number | null, endLine: number | null): boolean {
  const hunks = changed.get(path);
  if (hunks === undefined) {
    return false;
  }
  if (startLine === null || endLine === null || hunks.length === 0) {
    return true;
  }
  return hunks.some(({ start, count }) => (count === 0 ? start >= startLine && start < endLine : start <= endLine && start + count - 1 >= startLine));
}
