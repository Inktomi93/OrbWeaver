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

/** A body row of a GitHub-flavoured table: a leading `| `, and not the `| - | - |` alignment rule. The
 *  heading row is excluded by its caller, which knows the column name; excluding it here by shape would
 *  also drop a legitimate body row whose first cell is a column name. */
export function isTableBodyRow(line: string): boolean {
  return line.startsWith("| ") && !/^\|[\s:-]+\|/.test(line);
}

export interface LedgerSection {
  /** The `###` heading text, without the marker. */
  readonly heading: string;
  /** The source report the heading cites in backticks (`v-…-2026-09-12.md`), when it cites one. */
  readonly report: string | undefined;
  /** 1-based line of the heading. */
  readonly line: number;
  readonly rows: number;
}

const H3_MARKER_LENGTH = "### ".length;
const BYTES_PER_KIB = 1024;

const REPORT_CITE = /`([a-z0-9][a-z0-9.-]*\.md)`/;

/** Every `###` section under the ledger's `## THE LEDGER` heading, with its defect-row count.
 *
 *  The fence is the ENCLOSING `##`: sections after it (the class rollup, the ranked list) carry tables of
 *  their own, and counting those as defect rows is how the total goes wrong in the direction nobody
 *  checks. A section's rows are every table body row between its heading and the next heading of ANY
 *  depth, so a `####` subheading ends the count rather than silently extending it. */
export function ledgerSections(text: string): readonly LedgerSection[] {
  const sections: LedgerSection[] = [];
  let inLedger = false;
  let current: { heading: string; report: string | undefined; line: number; rows: number } | undefined;
  const flush = (): void => {
    if (current !== undefined) {
      sections.push({ ...current });
      current = undefined;
    }
  };
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("## ")) {
      flush();
      inLedger = line.trim() === "## THE LEDGER";
      return;
    }
    if (!inLedger) {
      return;
    }
    if (line.startsWith("#")) {
      flush();
      if (line.startsWith("### ")) {
        const heading = line.slice(H3_MARKER_LENGTH).trim();
        current = { heading, report: REPORT_CITE.exec(heading)?.[1], line: index + 1, rows: 0 };
      }
      return;
    }
    if (current !== undefined && isTableBodyRow(line) && !line.startsWith("| module |")) {
      current.rows += 1;
    }
  });
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
  let inRows = false;
  let rows = 0;
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
    if (inRows && isTableBodyRow(line) && !line.startsWith("| module |")) {
      rows += 1;
    }
  }
  return found ? { rows, declared } : undefined;
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
