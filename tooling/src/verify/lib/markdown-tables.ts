// THE GENERIC GFM TABLE READER, split out of ./gate-program-docs.ts when that module crossed the 450-line
// cap (#2242). It is the only block in there that knows NOTHING about the #1584 program documents: given
// lines, it answers "what tables are in here and what are their columns". Everything that knows what a
// ledger ROW means stayed behind.
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

/** EVERY TABLE IN `lines`, IDENTIFIED BY SHAPE — the ONE row predicate both readers share (#2075).
 *
 *  A table is a header row IMMEDIATELY FOLLOWED BY AN ALIGNMENT RULE, then data rows until the first line
 *  that is not a table line. The header is therefore recognised by its POSITION, never by its text, and the
 *  column names are read OFF it rather than assumed.
 *
 *  WHY THE TEXT PREDICATE FAILED, measured. Both readers previously excluded the header by the literal
 *  `| module |`, so the ONE ledger section whose schema is `| subject | defect | class | state | receipt |`
 *  (`p-suite-honesty`) counted its own header as a defect row: 210 against the ledger's own documented
 *  method's 209, an off-by-one carried in a GENERATED column and knowingly shipped once because the
 *  alternative was a stale column. `reportLedgerRows` read a 2-row `subject`-headed table as three. A
 *  literal predicate assumes every section shares a schema, and they do not.
 *
 *  AND IT CLOSES THE SEPARATOR-LESS SIBLING OF A REAL INCIDENT — stated precisely, because the tempting
 *  version of this sentence is not true. Appending two verifier sections on 2026-09-12 dropped the
 *  `| - | - |` separator; remark could then no longer parse the block as a table, serialised it as a
 *  PARAGRAPH, and escaped every leading pipe to `\|`. Seventeen rows landed as prose and the reconciler
 *  said so ("carries 0 row(s); the report declares 17"). **The RETIRED predicate also read that as 0** —
 *  `\|` fails its `startsWith("| ")` — so the catch was owed to remark's escaping, not to the predicate.
 *  Measured differential over the same inputs: a separator-less block whose pipes are NOT escaped reads
 *  TWO rows under the retired predicate and ZERO under this one. That is the case the shape rule closes:
 *  with no alignment rule there is no table, whether or not the serialiser happened to escape. */
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

/** Total data rows across every table in `lines` — the count both readers ask for. */
export function tableRowCount(lines: readonly string[]): number {
  return markdownTables(lines).reduce((total, table) => total + table.rows.length, 0);
}
