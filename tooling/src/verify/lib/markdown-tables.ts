// THE GENERIC GFM TABLE READER: given lines, it answers "what tables are in here and what are their
// columns". It knows nothing about what any document's rows mean.
//
// MARKDOWN, NOT A PARSER (the rule this reader is the whole of). Every read is line-shaped on purpose —
// an ATX heading, a table body row, a fenced code line — because these documents are edited by hand all day
// and a reader that needed a real Markdown AST would refuse more often than it answered. The costs are
// stated at each function rather than discovered: an indented table, a table inside a fence, and an
// unescaped `|` inside a cell are all misread.

/** A GFM alignment rule: the `| - | - |` line that makes the row above it a HEADER. */
const ALIGNMENT_RULE = /^\|[\s:|-]+\|\s*$/;

export interface MarkdownTableRow {
  readonly cells: readonly string[];
  /** 1-based, absolute in the document. */
  readonly line: number;
}

export interface MarkdownTable {
  /** Column names read off the header row, trimmed, in authored order. */
  readonly columns: readonly string[];
  readonly rows: readonly MarkdownTableRow[];
}

/** Split one `| a | b |` line into its cells. Authored `\|` escapes stay inside their cell. */
function cells(line: string): readonly string[] {
  return line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** EVERY TABLE IN `lines`, IDENTIFIED BY SHAPE.
 *
 *  A table is a header row IMMEDIATELY FOLLOWED BY AN ALIGNMENT RULE, then data rows until the first line
 *  that is not a table line. The header is therefore recognised by its POSITION, never by its text, and the
 *  column names are read OFF it rather than assumed: a literal header predicate (`| module |`) once counted
 *  the header of a differently-schemed table as a data row. With no alignment rule there is no table, so a
 *  separator-less block of pipe lines reads as zero rows rather than as data. */
export function markdownTables(lines: readonly string[], firstLine = 1): readonly MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const rule = lines[index + 1];
    if (header === undefined || rule === undefined || !header.startsWith("| ") || !ALIGNMENT_RULE.test(rule)) {
      continue;
    }
    const rows: MarkdownTableRow[] = [];
    let cursor = index + 2;
    for (; cursor < lines.length; cursor += 1) {
      const row = lines[cursor];
      if (row === undefined || !row.startsWith("| ") || ALIGNMENT_RULE.test(row)) {
        break;
      }
      rows.push({ cells: cells(row), line: firstLine + cursor });
    }
    tables.push({ columns: cells(header), rows });
    index = cursor - 1;
  }
  return tables;
}
