// The one home that turns a program position into the editor's line and column. Editors, git and ast-grep end a line at
// LF alone; a TypeScript source file's own line table (`getLineAndCharacterOfPosition`) also breaks at CR, U+2028 and
// U+2029, so a label built from it sits above the editor's line after any of them. Every `file:line` label and every
// line read back into a position goes through here, for the TypeScript 6 and the 7.1 source files alike: both carry
// their `text` and their positions are UTF-16 offsets into it.

import { existsSync, readFileSync } from "node:fs";

const LF = "\n";
// The program's text drops a leading byte-order mark that the file on disk carries.
const BYTE_ORDER_MARK = "\u{feff}";

// A text's line starts depend on its text alone, and a source file's text never changes, so each file's are read once.
const startsOf = new WeakMap<object, readonly number[]>();

/** The offset each line of `text` starts at, ending lines at LF alone. */
export function lineStartsOf(text: string): readonly number[] {
  const starts = [0];
  for (let at = text.indexOf(LF); at !== -1; at = text.indexOf(LF, at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

function startsFor(source: { readonly text: string }): readonly number[] {
  const known = startsOf.get(source);
  if (known !== undefined) {
    return known;
  }
  const starts = lineStartsOf(source.text);
  startsOf.set(source, starts);
  return starts;
}

// The index of the last start at or before `position`.
function lineIndexOf(starts: readonly number[], position: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** The editor's line, from 1, of a position in a source file. */
export const editorLineOf = (source: { readonly text: string }, position: number): number => lineIndexOf(startsFor(source), position) + 1;

/** The editor's column, from 0, of a position in a source file: its distance from its line's start. */
export function editorColumnOf(source: { readonly text: string }, position: number): number {
  const starts = startsFor(source);
  return position - (starts[lineIndexOf(starts, position)] ?? 0);
}

/** The position of an editor line, from 1, and column, from 0, in a source file. */
export const positionOfEditorLine = (source: { readonly text: string }, line: number, column: number): number =>
  (startsFor(source)[line - 1] ?? Number.NaN) + column;

/** A file's text as a program reads it, from disk, for a position the program reported in a file it holds no source
 *  object for; null when the file is not on disk. */
export function readEditorText(path: string): { readonly text: string } | null {
  return existsSync(path) ? { text: readFileSync(path, "utf8").replace(BYTE_ORDER_MARK, "") } : null;
}
