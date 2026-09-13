// THE CITED-DOCUMENT READERS for board-citation reconciliation (#2156) — the half that turns AUTHORED
// MARKDOWN into citations, split out of `lib/board-citations.ts` when that module reached 430 of the
// 450-line cap and this repair needed to add to it. The judge, the censuses and the report stayed there;
// nothing else moved. One direction: the judge imports this module, this module imports no judge.
//
// THE FENCE IS A SPAN, NOT A START MARKER (N1, `docs/reviews/gate-runtime/sec-barrier-review-2026-09-13.md`
// §4). The first version took `findIndex("## THE LEDGER")` and admitted every table row from there to END
// OF FILE, so `## CLASS ROLLUP`'s cross-cutting table entered the class-2 population: measured on the real
// ledger, 6 citations over 5 rows in the denominator, 5 of the advisory disagreements, 1 verdictless cell.
// Those cells are PROSE mentions ("#2000's §4.6 differential"), not `(board #N)` tracking pointers, and
// they were judged for resolution and BOARD MEMBERSHIP like real citations — so the first rollup sentence
// naming a number nobody minted would have been a hard exit 1 on a non-citation, with no exemption grammar
// to answer it. The ledger's own maintenance section states the law (*"The fence is `## THE LEDGER` → the
// next `##`"*) and the sibling reader `lib/gate-program-docs.ts#ledgerSections` already implements it;
// this module used HALF of that fence while its comment claimed the whole. It also compared a 0-based
// `findIndex` against a 1-based `row.line`, which admitted the line immediately ABOVE the heading.
//
// ADMISSION IS BY SCHEMA, AND HALF A SCHEMA IS A REFUSAL (N2). A ledger-row table names BOTH a `defect`
// and a `state` — `isLedgerRowTable`'s rule in the sibling reader, case-folded because these documents are
// hand-edited all day. Keying only on `state` made every non-vacuity guard here a FLOOR OF ONE: renaming
// `| state |` in the tables that hold no declaring row admitted 150 of 399 citations, printed a serene
// source receipt and EXITED 0 with 249 citations unread. So an in-fence table carrying exactly one of the
// pair is DRIFT and `assertLedgerSource` throws naming it — the rename is caught in both directions, with
// no baseline number and no threshold. Measured on the configured ledger 2026-09-13: 63 in-fence tables,
// ALL carrying both, contributing 356 citations; zero tables carry one without the other.
//
// A top-level row-shaped paragraph is refused by the shared ledger admission reader. Actual tables retain
// their authored cell bytes; examples nested in code, quotes, or lists do not enter the evidence plane.

import { subjectKey } from "./citation-subject.ts";
import { admitLedgerTables, ledgerHeadingSpan, readLedgerMarkdown } from "./ledger-table-admission.ts";
import type { MarkdownTable } from "./markdown-tables.ts";
import { markdownTables } from "./markdown-tables.ts";

/** A document handed to the readers: its repo-relative path and its text. */
export interface CitedDocument {
  readonly rel: string;
  readonly text: string;
}

export const CITATION_CLASSES = ["policy-workitem", "ledger-closure", "roster-reference"] as const;
export type CitationClass = (typeof CITATION_CLASSES)[number];

/** What a site's own grammar claims about the row it names — see the class table in `board-citations.ts`.
 *  `open` is claimed by exactly one class; the other two claim only that the row EXISTS. */
export type CitationClaim = "open" | "exists";

export interface BoardCitation {
  readonly citationClass: CitationClass;
  /** `path:line` for a document site, the policy id for a descriptor site. */
  readonly site: string;
  readonly issue: number;
  readonly claim: CitationClaim;
  /** The authored text the citation was read out of, trimmed for the report. */
  readonly context: string;
  /** The citing row's OWN subject key — class 2 only, and only where the row's table carries a
   *  `wave`/`lane` column. Present means "join this against what the cited row declares". */
  readonly subjectKey?: string;
}

/** One ledger state-cell citation with the cell's verdict word — the reader's row shape. */
export interface LedgerCitation {
  readonly citation: BoardCitation;
  readonly verdict: string | undefined;
}

const ISSUE_REF = /#(\d{2,5})/g;
/** The ledger's own verdict vocabulary, read as the FIRST such word in the cell. */
const LEDGER_VERDICT = /\b(CLOSED|FIXED|OPEN|PARTIAL|UNADJUDICATED|SUPERSEDED|RETIRED|DROPPED)\b/;
/** The heading that OPENS the ledger's defect rows; the next `## ` closes them (see the header). */
const LEDGER_FENCE = "## THE LEDGER";
const SECTION_HEADING = "## ";
/** The header of the column carrying a ledger row's own subject — authored as "wave · path:line", and
 *  "lane · …" in the sections a fix lane appended. Matched on the leading word so the trailing path:line
 *  spelling can drift without unhooking the join. */
const SUBJECT_COLUMN = /^(wave|lane)\b/iu;
const CONTEXT_MAX = 160;

/** The two column names that together identify a ledger DEFECT-ROW table. */
const DEFECT_COLUMN = "defect";
const STATE_COLUMN = "state";

/** The defect-row span, 1-based and EXCLUSIVE at both ends: the `## THE LEDGER` heading's own line, and the
 *  next `## ` heading's line (or one past the last line when the ledger is the final section).
 *  `undefined` when the document carries no fence at all — which `assertLedgerSource` refuses by name. */
export function ledgerSpan(lines: readonly string[]): { readonly start: number; readonly end: number } | undefined {
  return ledgerHeadingSpan(readLedgerMarkdown(lines.join("\n")), LEDGER_FENCE.slice(SECTION_HEADING.length));
}

function context(text: string): string {
  const flat = text.replaceAll(/\s+/gu, " ").trim();
  return flat.length > CONTEXT_MAX ? `${flat.slice(0, CONTEXT_MAX)}…` : flat;
}

function issuesIn(cell: string): readonly number[] {
  return [...cell.matchAll(ISSUE_REF)].map((match) => Number(match[1]));
}

function columnNames(table: MarkdownTable): ReadonlySet<string> {
  return new Set(table.columns.map((name) => name.toLowerCase()));
}

/** Every table with at least one row inside the defect-row span, paired with the schema verdict the
 *  admission and the drift refusal both key off. */
function inFenceTables(doc: CitedDocument, span: { readonly start: number; readonly end: number }): readonly MarkdownTable[] {
  return admitLedgerTables(readLedgerMarkdown(doc.text, doc.rel), span).map(({ table }) => table);
}

/** Every `#N` in a ledger's STATE cells, inside the defect-row span, with the cell's verdict word.
 *
 *  A table is admitted by SCHEMA — it names both a `defect` and a `state` — so a section whose columns
 *  differ (and they do differ: six schemas across the in-fence sections) is read by NAME rather than by
 *  position, and a cross-cutting table that merely happens to carry a `state` column is not a defect row. */
export function ledgerCitations(doc: CitedDocument): readonly LedgerCitation[] {
  const lines = doc.text.split("\n");
  const span = ledgerSpan(lines);
  if (span === undefined) {
    return [];
  }
  return inFenceTables(doc, span)
    .filter((table) => {
      const names = columnNames(table);
      return names.has(DEFECT_COLUMN) && names.has(STATE_COLUMN);
    })
    .flatMap((table) => ledgerTableCitations(doc, table, span));
}

/** One admitted table's in-span citations. The state column is found BY NAME off the header, and the row's
 *  own SUBJECT lives in the `wave · path:line` column — spelled `lane · …` in the sections a fix lane
 *  appended. A table with no subject column contributes citations that carry no subject: counted by the
 *  join as `unkeyed`, never guessed at. */
function ledgerTableCitations(doc: CitedDocument, table: MarkdownTable, span: { readonly start: number; readonly end: number }): readonly LedgerCitation[] {
  const column = table.columns.findIndex((name) => name.toLowerCase() === STATE_COLUMN);
  const subjectColumn = table.columns.findIndex((name) => SUBJECT_COLUMN.test(name));
  const rows = table.rows.filter((row) => row.line > span.start && row.line < span.end);
  return rows.flatMap((row) => {
    const cell = row.cells[column] ?? "";
    const verdict = LEDGER_VERDICT.exec(cell)?.[1];
    const key = subjectColumn < 0 ? undefined : subjectKey(row.cells[subjectColumn] ?? "");
    return issuesIn(cell).map((issue) => ({
      citation: {
        citationClass: "ledger-closure" as const,
        site: `${doc.rel}:${String(row.line)}`,
        issue,
        claim: "exists" as const,
        context: context(cell),
        ...(key === undefined ? {} : { subjectKey: key }),
      },
      verdict,
    }));
  });
}

/** Every `#N` in a roster's table rows. Resolution only — the openness half is refused (class 3). */
export function rosterCitations(doc: CitedDocument): readonly BoardCitation[] {
  const citations: BoardCitation[] = [];
  for (const table of markdownTables(doc.text.split("\n"), 1)) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        for (const issue of issuesIn(cell)) {
          citations.push({ citationClass: "roster-reference", site: `${doc.rel}:${String(row.line)}`, issue, claim: "exists", context: context(cell) });
        }
      }
    }
  }
  return citations;
}

/** REFUSE A CONFIGURED LEDGER THIS RUN CANNOT READ (codex review F2, extended by N2). Renaming the `state`
 *  column used to drop the class to zero and still exit 0 — `perClass` printed the zero and nothing
 *  enforced it, while the same-invocation controls kept firing against their own synthetic document, which
 *  proves the ALGORITHM and says nothing about whether the PRODUCTION source was admitted. The SCHEMA
 *  clause is what makes this survive a PARTIAL rename: a floor of one admitted table passes while 249 of
 *  399 citations go unread, but a table carrying half the pair cannot. Every clause is exit 2 at the CLI. */
export function assertLedgerSource(doc: CitedDocument): number {
  const lines = doc.text.split("\n");
  const span = ledgerSpan(lines);
  if (span === undefined) {
    throw new Error(`board-citations: ${doc.rel} carries no \`${LEDGER_FENCE}\` fence, so no table in it can be read as a defect row.`);
  }
  const tables = inFenceTables(doc, span);
  const drifted = tables.filter((table) => {
    const names = columnNames(table);
    return names.has(DEFECT_COLUMN) !== names.has(STATE_COLUMN);
  });
  const first = drifted[0];
  if (first !== undefined) {
    const names = columnNames(first);
    const missing = names.has(STATE_COLUMN) ? DEFECT_COLUMN : STATE_COLUMN;
    throw new Error(
      `board-citations: ${doc.rel} carries ${String(drifted.length)} in-fence defect-row table(s) with NO \`${missing}\` column — first at line ${String(first.rows[0]?.line ?? span.start)}, columns \`${first.columns.join(" | ")}\`. ` +
        "A ledger-row table names BOTH; half the pair is column drift, and admitting the rest would read a PARTIAL ledger as a clean one.",
    );
  }
  const admitted = tables.filter((table) => {
    const names = columnNames(table);
    return names.has(DEFECT_COLUMN) && names.has(STATE_COLUMN);
  });
  if (admitted.length === 0) {
    throw new Error(
      `board-citations: ${doc.rel} has no in-fence table naming both \`${DEFECT_COLUMN}\` and \`${STATE_COLUMN}\`. The class reads those columns BY NAME, so this is not a clean ledger — it is a ledger this run cannot read.`,
    );
  }
  const count = ledgerCitations(doc).length;
  if (count === 0) {
    throw new Error(
      `board-citations: ${doc.rel} yielded ZERO state-cell citations across ${String(admitted.length)} defect-row table(s). A configured ledger with no citations is a parser that stopped matching, not a ledger with nothing to check.`,
    );
  }
  return count;
}

/** The same source-specific non-vacuity for a configured roster: an existing but rewritten document whose
 *  citations no longer parse used to succeed with a printed zero. The roster has no `defect`/`state` pair
 *  to key a schema clause off, so this one stays a floor of ONE — declared, not implied. */
export function assertRosterSource(doc: CitedDocument): number {
  const count = rosterCitations(doc).length;
  if (count === 0) {
    throw new Error(
      `board-citations: ${doc.rel} yielded ZERO table-cell citations. A configured roster with no citations is a parser that stopped matching, not a roster with nothing to check.`,
    );
  }
  return count;
}
