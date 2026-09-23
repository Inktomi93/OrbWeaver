// THE FIDELITY JUDGEMENTS behind `ops/format.ts#formatMarkdown` — render (#2067), overflow (#2104),
// template-span (#2067) and source (#2235) — PURE over an mdast tree and the source bytes, which is what
// lets each law be held without the remark pipeline or a tree. Split out of the formatter at the size cap
// (2026-09-18): the formatter's header states the laws and the order they run in, each function here
// carries its own measured WHY, and the direction is one-way — this module imports nothing from `ops/`.

/** The structural slice of an mdast node this comparison reads. `mdast`'s own types are a TRANSITIVE
 *  dependency of `remark`, not one `tooling/` declares, so the bare `mdast` specifier does not resolve. */
interface MarkdownPoint {
  readonly line?: number | undefined;
  readonly offset?: number | undefined;
}

export interface MarkdownNode {
  readonly type: string;
  readonly value?: unknown;
  readonly children?: readonly MarkdownNode[];
  readonly position?: { readonly start?: MarkdownPoint | undefined; readonly end?: MarkdownPoint | undefined } | undefined;
}

/**
 * The comparison key for RENDER fidelity: the tree with source positions dropped, and with the TWO
 * differences that are true rendering equivalences normalized away.
 *
 *   · A LINE ENDING inside a `text` or `inlineCode` value. CommonMark renders a soft line break and a
 *     code-span line ending as a space, so a re-wrap there changes bytes and nothing else.
 *   · A SHORT TABLE ROW. GFM pads a row that carries fewer cells than its header, so a 2-cell row under a
 *     3-cell header already renders as three cells; the serializer writing the third one out changes
 *     bytes and nothing else. Modelling that here is what keeps the NARROW direction from reading as a
 *     render change — the direction rule in `overflowRefusal` and this padding are the same ruling seen
 *     from the write side and the compare side. Padding only, never truncation: an overflow row is
 *     refused before this runs, precisely because GFM DROPS that end instead of padding it.
 *
 * Every OTHER movement — a table gaining a cell, a code span swallowing its neighbour's whitespace, an
 * emphasis span changing extent — is a real render change and must refuse.
 */
export function fidelityKey(tree: MarkdownNode): string {
  // JSON, not a delimiter-joined string: a separator character cheap enough to type is also a character
  // a doc can contain, and this comparison decides whether bytes get written.
  const parts: unknown[] = [];
  const walk = (node: MarkdownNode, padTo: number): void => {
    const value = typeof node.value === "string" ? node.value : "";
    const rendered = node.type === "text" || node.type === "inlineCode" ? value.replaceAll(/\r?\n/gu, " ") : value;
    parts.push([node.type, rendered]);
    const children = node.children ?? [];
    const rowWidth = node.type === "table" ? (children[0]?.children ?? []).length : 0;
    for (const child of children) {
      walk(child, rowWidth);
    }
    for (let missing = children.length; missing < padTo; missing += 1) {
      parts.push(["tableCell", ""], "/");
    }
    parts.push("/");
  };
  walk(tree, 0);
  return JSON.stringify(parts);
}

/** The flat text of a node, for the occupancy census (cells hold inline trees, not strings). */
function flatten(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  return (node.children ?? []).map(flatten).join("");
}

function tablesOf(tree: MarkdownNode): readonly MarkdownNode[] {
  const found: MarkdownNode[] = [];
  const walk = (node: MarkdownNode): void => {
    if (node.type === "table") {
      found.push(node);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(tree);
  return found;
}

/**
 * THE OVERFLOW-ROW REFUSAL (#2104). A GFM body row with MORE cells than its header row does not render
 * wide — the renderer DISCARDS the overflow, so that content is in the file, greppable, and invisible to
 * every reader. It is invisible to a rendered diff too, which is how it survives review.
 *
 * The formatter's untouched instinct is the worst possible answer: it sizes the delimiter row to the
 * WIDEST row, which widens the header, makes the dropped cells appear under a blank heading, and leaves
 * the table internally CONSISTENT — so no consistency check can ever see it again. Three law docs shipped
 * that way and one sat unread for months (#2067, repaired in #2104).
 *
 * DIRECTION IS THE WHOLE RULE, and only one direction is the defect. A row with FEWER cells than the
 * header is PADDED by GFM and renders exactly as written — never a finding. A row with MORE is dropped
 * content — always one.
 *
 * The message carries the per-column OCCUPANCY census, because the verdict alone is not actionable: a
 * column occupied by one row out of three hundred is a stray unescaped `|` in that row, while a column
 * occupied by several is genuinely dropped content that belongs somewhere. Those need opposite repairs.
 *
 * ITS CORPUS RECEIPT IS ZERO, DELIBERATELY. Measured 2026-09-12 over all 1106 tables in the living
 * corpus: 0 overflowing rows, and 0 rows in the harmless narrow direction either. This is a FORWARD
 * guard — the three live instances were repaired in #2104, and every older one was already NORMALIZED by
 * a past format run that widened its header, which is why a width check cannot see them (the roster
 * `Core-Enforcement-Active-Gates.md:74` is uniformly 7 wide, header and all 300 rows). The detector for
 * that residue is a TRAILING UNNAMED HEADER COLUMN, a separate arm with a 19-table blast radius that is
 * not this policy's to ship. So this arm's proof is a PLANTED control in its family test, never a corpus
 * count — a zero here means "nothing has gone wrong yet", never "I could not measure".
 */
export function overflowRefusal(tree: MarkdownNode): string | null {
  const notes: string[] = [];
  for (const table of tablesOf(tree)) {
    const rows = table.children ?? [];
    const width = (rows[0]?.children ?? []).length;
    const overflowing = rows.slice(1).filter((row) => (row.children ?? []).length > width);
    if (overflowing.length === 0) {
      continue;
    }
    const widest = Math.max(...rows.map((row) => (row.children ?? []).length));
    const occupancy = Array.from(
      { length: widest },
      (_unused, column) => rows.slice(1).filter((row) => flatten((row.children ?? [])[column] ?? { type: "empty" }).trim() !== "").length,
    );
    notes.push(
      `table at line ${table.position?.start?.line ?? 0}: header declares ${width} column(s); ${overflowing.length} row(s) carry more, whose extra cells GFM DROPS (they render as nothing)`,
      ...overflowing.map((row) => `    line ${row.position?.start?.line ?? 0}: ${(row.children ?? []).length} cells vs header ${width}`),
      `    occupancy over ${rows.length - 1} body rows, by column: ${occupancy.join(" · ")} (a column occupied by ONE row is a stray unescaped \`|\` in that row; by several, it is content with no column)`,
    );
  }
  return notes.length > 0 ? notes.join("\n") : null;
}

/** Backticks in `text` that no backslash escapes — the spelling an author uses to OPEN a code span. */
function bareBacktickCount(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2; // a backslash consumes the next character, whatever it is
      continue;
    }
    if (text[index] === "`") {
      count += 1;
    }
    index += 1;
  }
  return count;
}

/** Backticks the serializer wrote backslash-escaped — its spelling for a backtick that is LITERAL CONTENT. */
function escapedBacktickCount(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "\\") {
      index += 1;
      continue;
    }
    if (text[index + 1] === "`") {
      count += 1;
    }
    index += 2;
  }
  return count;
}

/**
 * Source lines whose `text` nodes carry a BARE backtick — the sites of the loss, read off the SOURCE.
 *
 * A backtick that reached a `text` node is a backtick CommonMark did not read as a delimiter: the span
 * the author wrote never formed. Reading it from the source slice rather than from the node VALUE is the
 * half that matters — a backtick the author already escaped also lands in a text node (with the escape
 * stripped from the value), and that one is a deliberate literal, not a lost span.
 */
function orphanBacktickLines(tree: MarkdownNode, source: string): readonly number[] {
  const lines = new Set<number>();
  const walk = (node: MarkdownNode): void => {
    if (node.type === "text" && typeof node.value === "string" && node.value.includes("`")) {
      const start = node.position?.start;
      const end = node.position?.end;
      const slice = start?.offset === undefined || end?.offset === undefined ? node.value : source.slice(start.offset, end.offset);
      if (bareBacktickCount(slice) > 0) {
        lines.add(start?.line ?? 0);
      }
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(tree);
  return [...lines].sort((a, b) => a - b);
}

/**
 * A JavaScript template literal cannot sit inside a single-backtick Markdown code span: its two inner
 * backticks close and reopen the Markdown span. Remark then sees two valid `inlineCode` nodes separated
 * by template content, so both the serialized bytes and the re-parsed tree are stable while the author's
 * intended outer span never exists. Detect that ambiguous source shape from the adjacent parsed nodes.
 * Source bytes cannot distinguish the malformed outer span from intentional adjacent code / template
 * substitution / code fragments, so the formatter conservatively refuses both and directs either author
 * to the unambiguous longer-delimiter spelling. The no-whitespace boundary keeps separated prose between
 * code spans valid.
 */
export function ambiguousTemplateLiteralRefusal(tree: MarkdownNode, source: string): string | null {
  const lines = new Set<number>();
  const isSingleDelimitedCode = (node: MarkdownNode): boolean => {
    if (node.type !== "inlineCode") {
      return false;
    }
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) {
      return false;
    }
    return /^`[^`\n]+`$/u.test(source.slice(start, end));
  };
  const ambiguousLine = (left: MarkdownNode | undefined, middle: MarkdownNode | undefined, right: MarkdownNode | undefined): number | undefined => {
    if (left === undefined || middle === undefined || right === undefined || !isSingleDelimitedCode(left) || !isSingleDelimitedCode(right)) {
      return;
    }
    const value = middle.type === "text" && typeof middle.value === "string" ? middle.value : "";
    const boundedByContent = value.length > 0 && !/^\s|\s$/u.test(value);
    return boundedByContent && /\$\{[^}\n]+\}/u.test(value) ? (left.position?.start?.line ?? 0) : undefined;
  };
  const walk = (node: MarkdownNode): void => {
    const children = node.children ?? [];
    for (let index = 0; index + 2 < children.length; index += 1) {
      const line = ambiguousLine(children[index], children[index + 1], children[index + 2]);
      if (line !== undefined) {
        lines.add(line);
      }
    }
    for (const child of children) {
      walk(child);
    }
  };
  walk(tree);
  return lines.size === 0
    ? null
    : [
        "single-backtick code delimiters contain a JavaScript template literal, so the inner backticks terminate the Markdown span (#2067)",
        ...[...lines]
          .toSorted((a, b) => a - b)
          .map((line) => `    line ${String(line)}: use longer backtick delimiters to make the intended span boundaries explicit`),
      ].join("\n");
}

/**
 * THE ESCAPE-DELTA REFUSAL (#2235). The formatter's worst failure mode is not a refusal it gets wrong —
 * it is a WRITE that looks like a cosmetic pass and is a silent content loss, because every later run
 * then launders the loss into "stable".
 *
 * THE SHAPE, measured: an author writes a code span inside a GFM table cell and the span contains a bare
 * `|`. The pipe is a CELL BOUNDARY before it is content, so the parse never forms the span — the
 * backticks land in `text` nodes as literal characters, split across the cells the pipe created. The
 * serializer, correctly for a literal backtick, escapes them: a cell reading (backtick) --theme (angle)
 * name | id | none (angle) (backtick) is written back with every one of those four characters
 * backslash-escaped. That is the exact byte shape #2145 was filed to repair on .claude/agents/side-eye.md:170, and
 * `format --write` produced it at exit 0 with no refusal at all.
 *
 * WHY THE TWO STANDING GUARDS CANNOT SEE IT, and why the check could not be bolted onto either:
 *   · the overflow census (above) fires only when a body row out-widths its HEADER. In the measured
 *     instance the header was 5 wide and the split row was 5 wide, so there was nothing to count;
 *   · `fidelityKey` compares PARSE TREES, and the escape is render-identical. The loss had ALREADY
 *     happened at parse time, so a check against the render is a check against the damage — it can only
 *     ever agree with itself. THIS check therefore compares the output to the SOURCE BYTES, which is the
 *     one place the signal survives.
 *
 * THE PREDICATE, and it is a statable authoring contract rather than a heuristic: a backtick that was
 * BARE in the source and ESCAPED in the output is a code span the parse did not form. A backtick the
 * author genuinely means as literal content is written backslash-escaped in the SOURCE, whereupon the delta is zero
 * and the file formats normally — that is the second arm of the family test, and it is what stops this
 * being a blanket refusal.
 *
 * SCOPED TO BACKTICKS DELIBERATELY. The same run also escapes angle brackets, and folding those in was
 * REFUSED: an escape there has a real CommonMark justification (it can open an autolink or raw HTML), so
 * a delta there is not by itself evidence of a lost construct. A backtick has exactly one job.
 *
 * ITS CORPUS RECEIPT IS TWO, MEASURED, NOT ZERO (2026-09-12, over the 328-file living corpus at
 * `cf7e46d12`): 163 files would be rewritten by a `--write`, and exactly two of them would gain backtick
 * escapes — the gate-runtime program's wave-4 fix review (+12) and its refutation ledger (+3), both since
 * deleted with that program's working set. Both were the evidence documents carrying this defect, and both
 * were being silently cemented. The planted control beside this arm is what holds it now.
 */
export function escapeDeltaRefusal(input: string, output: string, parsed: MarkdownNode): string | null {
  const delta = escapedBacktickCount(output) - escapedBacktickCount(input);
  if (delta <= 0) {
    return null;
  }
  const lines = orphanBacktickLines(parsed, input);
  return [
    `formatting it would escape ${String(delta)} backtick(s) that are BARE in the source — each one is a code span CommonMark did not form, and writing it back as a literal \\\` cements the loss (#2235)`,
    ...lines.map((line) => `    line ${String(line)}: a backtick reaching TEXT, not a code-span delimiter`),
    "    usual cause: a bare `|` inside a code span inside a table cell — the pipe ends the cell first, so the span never opens. Escape it as \\| inside the span.",
    "    if the backtick really is literal content, escape it in the SOURCE (\\`) and this stops firing.",
  ].join("\n");
}
