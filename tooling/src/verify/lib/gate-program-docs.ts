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
import type { MarkdownTable } from "./markdown-tables.ts";
// The generic GFM table reader moved to ./markdown-tables.ts and the CLASS ROLLUP to
// ./gate-program-rollup.ts at the 450-line cap (#2242). Neither is re-exported from here: biome's
// `lint/performance/noBarrelFile` forbids it, so every caller — including `verify/index.ts`, which
// publishes `markdownTables` — names the module that authors what it uses.
import { markdownTables, tableRowCount } from "./markdown-tables.ts";

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
/** The ONE spelling of the ledger fence, shared by the section scanner and the stray scanner — two readers
 *  disagreeing about where the fence is would reintroduce #2166 from the other side. */
const LEDGER_FENCE = "## THE LEDGER";
/** Where the body ENDS. Shares the fence's reasoning: the section scanner, the stray scanner and the
 *  rollup deriver must agree on both edges or they measure different files (#2166, #2207). */
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
      inLedger = line.trim() === LEDGER_FENCE;
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

/** A ledger-row table by SCHEMA: it names both a `defect` and a `state`. Schema-keyed and not first-column
 *  keyed, which is #2075's lesson — the in-fence tables use SIX different schemas (`module` and `subject`
 *  first cells, four different trailing-cell counts) and all six carry this pair, while NO table outside the
 *  fence does (measured 2026-09-12 over all 30 tables in the ledger: 25 in-fence ledger-shaped, 0 out).
 *
 *  THE MATCH IS CASE-FOLDED (#2224). A header spelled `| Defect | State |` is the SAME schema — markdown
 *  gives a header row no canonical case and these documents are hand-edited all day — and an exact-case
 *  `Set.has` bound NOTHING against one, so a whole ledger-shaped section could sit outside the fence and
 *  read as prose. Planted and measured 2026-09-12: silent. Case is presentation; the schema is the fact. */
function isLedgerRowTable(table: MarkdownTable): boolean {
  const columns = new Set(table.columns.map((column) => column.toLowerCase()));
  return columns.has("defect") && columns.has("state");
}

export interface StrayLedgerSection {
  /** The heading text, without its `#` marker — or the enclosing `##`'s own text when the rows sit under
   *  that `##` with no subheading of their own at all (#2224's headingless shape). */
  readonly heading: string;
  /** 1-based line of the heading. */
  readonly line: number;
  /** The `##` heading it actually sits under — what the author appended below by mistake. */
  readonly enclosing: string;
  /** The report the heading cites, when it cites one. */
  readonly report: string | undefined;
  readonly rows: number;
}

/** LEDGER ROWS THAT ARE IN THE FILE AND OUTSIDE THE FENCE — a REFUSAL, never a silent skip (#2166).
 *
 *  `ledgerSections` is fenced by `## THE LEDGER` → the next `##`, which is correct and is also exactly how
 *  six real defect rows went invisible: `6c983149e` appended `### cb-v-fix-wave-1` BELOW `## CLASS ROLLUP`,
 *  so the reconciler did not count it, the rollup rebuild did not include it, and `ledgers:fresh` reported
 *  the SAME "11 of 24 reconcilable" before and after — correct about a section it could not see. A naive
 *  `grep -c` finds those rows, which is the false-clean shape: the instrument stopped early and said
 *  nothing about what it stopped short of.
 *
 *  So the fence now REPORTS what it excludes. A section outside the fence carrying a ledger-shaped table is
 *  a stray; the consumer names the heading, its line, the `##` it landed under, and the fence it belongs
 *  in. The predicate keys on the table's SCHEMA rather than on the heading's wording, so it also catches a
 *  section whose heading cites no report at all (`### p-suite-honesty` is a real cite-less section, so a
 *  cite-keyed predicate would have a live blind spot).
 *
 *  AND IT NOW READS EVERY CONTAINER A ROW CAN LAND IN (#2224). The first cut opened a candidate only on a
 *  literal `### ` OUTSIDE the fence, which left FOUR sibling shapes silent — each planted below the rollup
 *  and each producing no finding at all:
 *
 *    1. a bare `## ` section       — `## ` only reset `enclosing` and never opened a candidate;
 *    2. a table with NO heading    — rows appended directly under a `##`, so no candidate was ever open;
 *    3. a `#### ` heading          — `"#### x".startsWith("### ")` is FALSE (the fourth `#` is not a space);
 *    4. a `| State |` header       — the case-sensitive schema match above.
 *
 *  Shapes 1-3 are one defect: the scanner modelled the CONTAINER as "an h3", and the container is
 *  "whatever heading most recently opened, including the `##` itself". So a `##` now opens a candidate
 *  enclosing ITSELF — which closes the headingless shape for free, because those rows are inside the `##`'s
 *  own body — and any `#{2,4}` opens one. That is the same generalisation #2166 asked for and stopped one
 *  depth short of: an instrument that can only see the shape that already bit it is not a fence, it is a
 *  memory of one incident.
 *
 *  ALL FOUR ARE LATENT ON TODAY'S TREE (measured 2026-09-13 on `refutation-ledger-2026-09-12.md`: below
 *  `## CLASS ROLLUP` there are 4 `##` and 1 `###` heading and THREE tables, none ledger-shaped) — so this
 *  widening lands no new finding, and its proof is the planted controls in its family test, never the zero. */
/** An ATX heading of depth 2-4 — the containers a ledger section can land in. Depth 1 is the document
 *  title and depth 5+ has never carried a table here; both would widen the scan without widening what it
 *  can catch. The capture is the marker so the depth is readable at the call site. */
const CONTAINER_HEADING = /^(#{2,4}) (.*)$/;

export function strayLedgerSections(text: string): readonly StrayLedgerSection[] {
  const lines = text.split("\n");
  const strays: StrayLedgerSection[] = [];
  let inLedger = false;
  let enclosing = "(top of file)";
  let current: { heading: string; line: number; enclosing: string; body: string[] } | undefined;
  const flush = (): void => {
    if (current === undefined) {
      return;
    }
    const tables = markdownTables(current.body).filter(isLedgerRowTable);
    if (tables.length > 0) {
      strays.push({
        heading: current.heading,
        line: current.line,
        enclosing: current.enclosing,
        report: REPORT_CITE.exec(current.heading)?.[1],
        rows: tables.reduce((total, table) => total + table.rows.length, 0),
      });
    }
    current = undefined;
  };
  for (const [index, line] of lines.entries()) {
    const container = CONTAINER_HEADING.exec(line);
    if (container === null) {
      // A heading this scan does not model (h1, h5+) still ENDS the open candidate — a table after it is
      // not in the section above it — but opens nothing.
      if (line.startsWith("#")) {
        flush();
        continue;
      }
      if (current !== undefined) {
        current.body.push(line);
      }
      continue;
    }
    flush();
    const heading = (container[2] ?? "").trim();
    if (container[1] === "##") {
      enclosing = line.trim();
      inLedger = line.trim() === LEDGER_FENCE;
    }
    if (!inLedger) {
      // A `##` encloses ITSELF: rows appended under it with no subheading are inside its body, which is
      // the headingless shape. Every other depth carries the `##` it landed under, which is what the
      // drift line tells the author to move the section out of.
      current = { heading, line: index + 1, enclosing, body: [] };
    }
  }
  flush();
  return strays;
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
