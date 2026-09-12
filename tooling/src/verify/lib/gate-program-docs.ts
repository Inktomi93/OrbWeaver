// Shared readers for the #1584 program docs' DERIVABLE numeric claims (#2017). Two consumers today, both
// in `ops/`: the read-first cost-table generator and the refutation-ledger row reconciliation. They are
// here rather than in either consumer because the LEDGER'S SECTION ROW COUNT is read by both — the cost
// table's row 3 prices the work queue by its defect-row count, and the reconciliation compares that same
// count against the verifier report each section came from.
//
// WHY THESE CLAIMS NEEDED A READER AT ALL. `gate-runtime-read-first.md`'s cost table is a BUDGET a cold
// session commits to before it reads anything, and on 2026-09-12 **all eight of its sizes were stale** —
// the law 139→180, the runbook 78→116, the roster 281→356, and the work queue by nearly SEVEN TIMES,
// 25 KB against an actual 172. A 7x understatement in the one table whose entire purpose is telling a
// session what the reading costs. The repair was a hand re-measurement, which is the same repair the file
// had already had and the same one it will need next week; the durable answer is that the numbers stop
// being authored.
//
// MARKDOWN, NOT A PARSER. Every read here is line-shaped on purpose — an ATX heading, a table body row, a
// fenced code line — because these documents are edited by hand all day and a reader that needed a real
// Markdown AST would refuse more often than it answered. The costs of that choice are stated at each
// function rather than discovered: an indented table, a table inside a fence, and a `|` inside a cell that
// is not escaped are all misread, and the roster's own header carries the MERGE-BOMB warning about that
// last one for an unrelated reason.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
function tableRowCount(lines: readonly string[]): number {
  return markdownTables(lines).reduce((total, table) => total + table.rows.length, 0);
}

export interface LedgerSection {
  /** The `###` heading text, without the marker. */
  readonly heading: string;
  /** The source report the heading cites in backticks (`v-…-2026-09-12.md`), when it cites one. */
  readonly report: string | undefined;
  /** 1-based line of the heading. */
  readonly line: number;
  readonly rows: number;
  /** Column names of the section's FIRST table, read off its header row. Empty when the section carries no
   *  table at all — which is a real state (an escaped-pipe paragraph, a prose-only section) and is what a
   *  drift line must be able to say rather than reporting a bare zero. */
  readonly columns: readonly string[];
}

const H3_MARKER_LENGTH = "### ".length;
const BYTES_PER_KIB = 1024;

const REPORT_CITE = /`([a-z0-9][a-z0-9.-]*\.md)`/;

/** Every `###` section under the ledger's `## THE LEDGER` heading, with its defect-row count.
 *
 *  The fence is the ENCLOSING `##`: sections after it (the class rollup, the ranked list) carry tables of
 *  their own, and counting those as defect rows is how the total goes wrong in the direction nobody checks.
 *  A section's body ends at the next heading of ANY depth, so a `####` subheading ends the count rather
 *  than silently extending it. Within that body the rows are `markdownTables`'s, so the header is excluded
 *  by SHAPE and no section's schema is assumed (#2075). */
export function ledgerSections(text: string): readonly LedgerSection[] {
  const lines = text.split("\n");
  const sections: LedgerSection[] = [];
  let inLedger = false;
  let current: { heading: string; report: string | undefined; line: number; body: string[] } | undefined;
  const flush = (): void => {
    if (current !== undefined) {
      const tables = markdownTables(current.body);
      sections.push({
        heading: current.heading,
        report: current.report,
        line: current.line,
        rows: tables.reduce((total, table) => total + table.rows.length, 0),
        columns: tables[0]?.columns ?? [],
      });
      current = undefined;
    }
  };
  // A plain indexed loop rather than a callback: biome's flow analysis narrows a `let … | undefined`
  // captured by a closure to non-optional, and then calls the guard that IS needed unnecessary.
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("## ")) {
      flush();
      inLedger = line.trim() === "## THE LEDGER";
      continue;
    }
    if (!inLedger) {
      continue;
    }
    if (line.startsWith("#")) {
      flush();
      if (line.startsWith("### ")) {
        const heading = line.slice(H3_MARKER_LENGTH).trim();
        current = { heading, report: REPORT_CITE.exec(heading)?.[1], line: index + 1, body: [] };
      }
      continue;
    }
    if (current !== undefined) {
      current.body.push(line);
    }
  }
  flush();
  return sections;
}

export interface ReportRowTable {
  /** Body rows of the report's own `LEDGER ROWS` table. */
  readonly rows: number;
  /** The count the heading DECLARES (`## LEDGER ROWS (4 rows)`), when it declares one. */
  readonly declared: number | undefined;
}

/** A verifier report's own `LEDGER ROWS` table, or `undefined` when the report declares none.
 *
 *  `undefined` is a real and common answer, not a failure: an AUDIT report (the ten waves) is distilled
 *  INTO the ledger by its reader and never declares rows of its own. The distinction matters because the
 *  reconciliation must report how many sections it could NOT hold rather than printing a serene count of
 *  the ones it could. */
export function reportLedgerRows(text: string): ReportRowTable | undefined {
  const body: string[] = [];
  let inRows = false;
  let declared: number | undefined;
  let found = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      const match = /LEDGER ROWS(?:\s*\((\d+) rows?\))?/.exec(line);
      inRows = match !== null;
      if (match !== null) {
        found = true;
        declared = match[1] === undefined ? declared : Number(match[1]);
      }
      continue;
    }
    if (inRows) {
      body.push(line);
    }
  }
  // Same shape rule as the ledger side, which is the point: the two counts being compared must be produced
  // by ONE predicate, or the comparison measures the readers against each other rather than the documents.
  return found ? { rows: tableRowCount(body), declared } : undefined;
}

/** Gate rows of the enforcement roster's main table — a body row whose first cell is a backticked id. The
 *  roster carries a second, narrower table (the Layer-3 activation triggers) whose rows have the same
 *  shape, so this is a count of the ROSTER's declared ids and the parity gate remains the authority on
 *  which ids those are. */
export function backtickedIdRows(text: string): number {
  return text.split("\n").filter((line) => /^\| `[a-z0-9-]+` \|/.test(line)).length;
}

export interface PathSetSize {
  readonly files: number;
  readonly bytes: number;
}

/** Total bytes and file count for an explicit repo-relative path list. A MISSING member throws rather than
 *  contributing zero: a cost table that silently priced a deleted document at 0 KB would understate the
 *  budget in exactly the direction that produced #2017, and the generator's caller turns a throw into a
 *  tool error (never a verdict). */
export function pathSetSize(root: string, paths: readonly string[]): PathSetSize {
  let bytes = 0;
  for (const rel of paths) {
    bytes += statSync(join(root, rel)).size;
  }
  return { files: paths.length, bytes };
}

/** KiB as the table prints it. `du -k` reports 4 KiB DISK BLOCKS and this reports content bytes, so the
 *  two disagree by up to a block per file — which is why the regenerated table states its unit. */
export function kib(bytes: number): number {
  return Math.round(bytes / BYTES_PER_KIB);
}

export function readDoc(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}
