// The quoted-speech DETECTOR (the engine half of the `--color-dialogue` tint; the React half is
// dialogue-paragraph.tsx). Imported ST cards carry their entire visual structure in QUOTED SPEECH ("…"
// for dialogue, plain prose for narration; Azarael's five greetings contain ZERO asterisks and ZERO
// HTML), which ST tints with its own quote color. Rendering those quotes at body color is why such a
// card reads as "unformatted" here.
//
// The grammar is deliberately timid — fail plain, never wrong (a mis-tint is worse than no tint):
//   · a run is `"…"` or `“…”`, STRICTLY paired (a `“` is not closed by a `"`) — a mismatched pair
//     stays plain, since mixed delimiters mean malformed prose, not a run;
//   · single quotes never participate, so apostrophes/contractions ("don't") can't open anything;
//   · a run may not cross a newline (ST's own quote regex is line-bound) — a stray `"` therefore can
//     never swallow the rest of a hard-wrapped paragraph;
//   · an unclosed run stays plain — the close must be found in the SAME paragraph;
//   · a run may span sibling parts (an `<em>` or a streaming per-word span between the delimiters):
//     each participating part is tinted, and an ATOMIC part (an element) is covered whole or not at all;
//   · a part with no readable text is opaque — it contributes no quote characters, which is exactly what
//     makes an inline `<code>` span unable to open or close a run.

/** Opener → its required closer. Straight quotes self-pair; typographic quotes pair by direction. */
const QUOTE_PAIRS: ReadonlyMap<string, string> = new Map([
  ['"', '"'],
  ["“", "”"],
]);

/** One paragraph child, projected for detection. */
export interface DialoguePart {
  /** The child's readable text — `""` for an opaque child (an element whose text can't participate). */
  readonly text: string;
  /** True when the child can only be tinted WHOLE (an element), false for a sliceable raw string child. */
  readonly atomic: boolean;
}

/** A rendered slice of one part: `text` is null for an atomic part (the caller re-uses the child itself). */
export interface DialoguePiece {
  readonly text: string | null;
  readonly quoted: boolean;
}

interface OpenRun {
  readonly part: number;
  readonly offset: number;
  readonly closer: string;
}

interface Range {
  readonly start: number;
  readonly end: number;
}

/** A position inside the part list: the part's index + an offset into its text. */
interface Cursor {
  readonly part: number;
  readonly offset: number;
}

/** Writes the covered range of every part from the open run's opener through the closer at `end`. */
function markRun(ranges: Range[][], parts: readonly DialoguePart[], open: OpenRun, end: Cursor): void {
  for (let i = open.part; i <= end.part; i += 1) {
    const target = ranges[i];
    const length = parts[i]?.text.length ?? 0;
    if (target === undefined) {
      continue;
    }
    // An atomic part is covered whole — its text is one indivisible child.
    const atomic = parts[i]?.atomic === true;
    const start = atomic || i !== open.part ? 0 : open.offset;
    const stop = atomic || i !== end.part ? length : end.offset + 1;
    target.push({ start, end: stop });
  }
}

/** Scans one part, writing any run that CLOSES inside it; returns the run still open after it (or null). */
function scanPart(ranges: Range[][], parts: readonly DialoguePart[], index: number, incoming: OpenRun | null): OpenRun | null {
  const text = parts[index]?.text ?? "";
  let open = incoming;
  for (let j = 0; j < text.length; j += 1) {
    const ch = text[j] ?? "";
    if (ch === "\n") {
      open = null; // a run never crosses a line break
    } else if (open === null) {
      const closer = QUOTE_PAIRS.get(ch);
      open = closer === undefined ? null : { part: index, offset: j, closer };
    } else if (ch === open.closer) {
      markRun(ranges, parts, open, { part: index, offset: j });
      open = null;
    }
  }
  return open;
}

/** Slices one part's text on its covered ranges (ordered, non-overlapping), dropping empty pieces. */
function slicePart(text: string, ranges: readonly Range[]): DialoguePiece[] {
  const pieces: DialoguePiece[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      pieces.push({ text: text.slice(cursor, range.start), quoted: false });
    }
    if (range.end > range.start) {
      pieces.push({ text: text.slice(range.start, range.end), quoted: true });
    }
    cursor = range.end;
  }
  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor), quoted: false });
  }
  return pieces;
}

/**
 * The detector: projects each paragraph child into its tinted/plain pieces. Pure — the grammar above is
 * the whole contract, and a part with no covered range comes back as a single plain piece.
 */
export function splitDialogue(parts: readonly DialoguePart[]): readonly (readonly DialoguePiece[])[] {
  const ranges: Range[][] = parts.map(() => []);
  let open: OpenRun | null = null;
  for (const [i] of parts.entries()) {
    open = scanPart(ranges, parts, i, open);
  }
  return parts.map((part, i) => {
    const covered = ranges[i] ?? [];
    if (part.atomic) {
      return [{ text: null, quoted: covered.length > 0 }];
    }
    return slicePart(part.text, covered);
  });
}

/** True when the text carries any delimiter the grammar can act on (the untouched-render fast path). */
export function hasQuoteChar(text: string): boolean {
  for (const ch of text) {
    if (QUOTE_PAIRS.has(ch)) {
      return true;
    }
  }
  return false;
}
