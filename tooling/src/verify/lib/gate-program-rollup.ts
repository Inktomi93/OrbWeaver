// THE CLASS ROLLUP DERIVATION for the #1584 refutation ledger, split out of ./gate-program-docs.ts when that
// module crossed the 450-line cap (#2242). It is one question with one reader — "what does the ledger BODY
// say, and does the committed `## CLASS ROLLUP` table agree" — and the three counting rules below are the
// ledger's own, each one paid for by a disagreement between two implementations.

import type { MarkdownTable, MarkdownTableRow } from "./markdown-tables.ts";
import { markdownTables } from "./markdown-tables.ts";

/** The heading whose table SUMMARISES the ledger body, and the fence its body rows live inside. */
const CLASS_ROLLUP_HEADING = "## CLASS ROLLUP";
const LEDGER_FENCE = "## THE LEDGER";

/** THE CLASS ROLLUP, DERIVED FROM THE BODY (#2207).
 *
 *  The ledger's `## CLASS ROLLUP` table SUMMARISES the rows above it and was reconciled by nothing, so it
 *  went stale twice in two days — first reading `91 rows · 33/7/3/48` against a body of 99, then `100 rows`
 *  against a body of 303, which is a 203-row error that survived every `pnpm check` of the preceding day.
 *  `ledgerSectionDrift` is correct to report the file FRESH: it reconciles each SECTION against the REPORT
 *  that section cites, and the rollup cites nothing. This is the missing reader, not a wider one.
 *
 *  THE THREE COUNTING RULES ARE THE LEDGER'S OWN and every one was paid for — two independent
 *  implementations disagreed by 45 rows on CLOSED until they agreed on all three:
 *    (1) split a row on UNESCAPED pipes only — a `\|` inside a code span is a cell ESCAPE, not a boundary.
 *        Free here: `markdownTables` has always split that way.
 *    (2) take the `state` column's index OFF THE HEADER BY NAME, never by position — the in-fence tables
 *        carry six header shapes and three have trailing EMPTY columns, so a fixed index bins the wrong
 *        cell. Also free: `markdownTables` reads the names off the header row by SHAPE.
 *    (3) bin by the state cell's first BOLDED word WHEN IT HAS ONE, else by the cell's first word — 56 of
 *        the 303 state cells carry no bold at all (`OPEN`, `OPEN (advisory)`, `SUPERSEDED — …`), and the
 *        literal "first bolded word" reading reported those as UNBINNED and CLOSED short by 12.
 *  Rule 3 is the only one this function has to implement, which is the argument for deriving through the
 *  shared table reader rather than re-spelling a markdown parser beside it.
 *
 *  THE SPAN IS FENCE-TO-ROLLUP. Tables BELOW `## CLASS ROLLUP` (the rollup itself, the ranked free-text
 *  list) are summaries, and counting a summary as a body row is the direction the total goes wrong in
 *  without anyone noticing. */
export interface ClassRollupRow {
  readonly klass: string;
  readonly rows: number;
  /** Keyed by the state bin, every bin present — a missing key and a zero must not render differently. */
  readonly states: Readonly<Record<string, number>>;
}

export interface ClassRollup {
  readonly rows: readonly ClassRollupRow[];
  readonly total: ClassRollupRow;
  readonly tables: number;
  /** Data rows per in-fence table, in document order. The counting paragraph REQUIRES this be printed:
   *  "the three defects above were all invisible to a run that printed only the totals". */
  readonly perTable: readonly number[];
  /** State cells binning to none of `STATE_BINS`, verbatim. Never silently dropped. */
  readonly unbinned: readonly string[];
  /** In-fence tables carrying no `state` column at all — rule 2 cannot be applied, so they are REPORTED
   *  rather than skipped: a table the binner cannot read is exactly the blindness this arm exists for. */
  readonly statelessTables: readonly (readonly string[])[];
}

export const STATE_BINS = ["CLOSED", "OPEN", "SUPERSEDED", "DISSOLVED", "UNADJUDICATED", "N/A", "FIXED"] as const;
const ROLLUP_CLASSES = ["§4.1", "§4.2", "§4.5", "§4.6", "§5b.1", "§5b.2", "§5b.3", "§5b.5", "§5b.7", "§12.3", "roster"] as const;
const OTHER_CLASS = "other";
const TOTAL_CLASS = "TOTAL";
const FIRST_BOLD = /\*\*([\s\S]+?)\*\*/;
/** A bin token is letters plus the solidus, so `N/A` survives as one word. */
const FIRST_WORD = /[A-Za-z][A-Za-z/]*/;

/** Rule 3, and it is the whole of this function: the first bolded word when the cell has one, else the
 *  cell's first word. Returns `undefined` for a cell that yields neither, which the caller reports. */
function stateBin(cell: string): string | undefined {
  const bolded = FIRST_BOLD.exec(cell)?.[1];
  const word = FIRST_WORD.exec(bolded ?? cell)?.[0];
  const token = word?.toUpperCase();
  return token !== undefined && (STATE_BINS as readonly string[]).includes(token) ? token : undefined;
}

/** The class cell bins by its FIRST NAMED class, so a `§4.1 narrowing · §4.5 pin` row counts once under
 *  §4.1 rather than in both — the first pass double-counted exactly there. */
function classBin(cell: string): string {
  return ROLLUP_CLASSES.find((named) => cell.includes(named)) ?? OTHER_CLASS;
}

function emptyStates(): Record<string, number> {
  return Object.fromEntries(STATE_BINS.map((state) => [state, 0]));
}

/** The in-fence body tables: everything between `## THE LEDGER` and `## CLASS ROLLUP`. */
function inFenceLines(text: string): readonly string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === LEDGER_FENCE);
  const end = lines.findIndex((line) => line.trim() === CLASS_ROLLUP_HEADING);
  return start === -1 || end === -1 || end < start ? [] : lines.slice(start, end);
}

/** The mutable accumulator one body table at a time folds into. Named rather than inlined so the
 *  derivation reads as "fold every table, then project", which is what it is. */
interface RollupTally {
  readonly states: Map<string, Record<string, number>>;
  readonly counts: Map<string, number>;
  readonly unbinned: string[];
  readonly statelessTables: (readonly string[])[];
}

/** Fold ONE in-fence table into the tally. Rule 2 lives here: the `state` index comes off THIS table's own
 *  header, and a table without that column is recorded as unreadable rather than skipped. */
function tallyTable(table: MarkdownTable, tally: RollupTally): void {
  const stateIndex = table.columns.indexOf("state");
  if (stateIndex === -1) {
    tally.statelessTables.push(table.columns);
    return;
  }
  const classIndex = table.columns.indexOf("class");
  for (const row of table.rows) {
    const cell = row.cells[stateIndex] ?? "";
    const klass = classBin(classIndex === -1 ? "" : (row.cells[classIndex] ?? ""));
    const bin = stateBin(cell);
    const states = tally.states.get(klass) ?? emptyStates();
    if (bin === undefined) {
      tally.unbinned.push(cell);
    } else {
      states[bin] = (states[bin] ?? 0) + 1;
    }
    tally.states.set(klass, states);
    tally.counts.set(klass, (tally.counts.get(klass) ?? 0) + 1);
  }
}

export function deriveClassRollup(text: string): ClassRollup {
  const tables = markdownTables(inFenceLines(text));
  const tally: RollupTally = { states: new Map(), counts: new Map(), unbinned: [], statelessTables: [] };
  for (const table of tables) {
    tallyTable(table, tally);
  }
  const { counts, unbinned, statelessTables } = tally;
  const perTable = tables.map((table) => table.rows.length);
  const rows = [...ROLLUP_CLASSES, OTHER_CLASS].map((klass) => ({
    klass,
    rows: counts.get(klass) ?? 0,
    states: tally.states.get(klass) ?? emptyStates(),
  }));
  const totalStates = emptyStates();
  for (const row of rows) {
    for (const state of STATE_BINS) {
      totalStates[state] = (totalStates[state] ?? 0) + (row.states[state] ?? 0);
    }
  }
  return {
    rows,
    total: { klass: TOTAL_CLASS, rows: rows.reduce((sum, row) => sum + row.rows, 0), states: totalStates },
    tables: tables.length,
    perTable,
    unbinned,
    statelessTables,
  };
}

export interface CommittedClassRollup {
  readonly rows: readonly ClassRollupRow[];
  /** State bins the committed table has no COLUMN for. A short schema is not a cell mismatch and must not
   *  be reported as one — it is the historical defect itself: the rollup that stood until 2026-09-12
   *  carried six state columns and no `FIXED`, which is exactly what 11 of one section's 12 rows said, so
   *  every one of them was invisible to the summary rather than miscounted in it. */
  readonly missingBins: readonly string[];
}

/** The COMMITTED rollup, read back out of the `## CLASS ROLLUP` table itself, so the comparison is
 *  table-against-table rather than derivation-against-derivation. Identified by its `class` + `rows`
 *  header and NOT by requiring every bin — the section carries a second table (the ranked free-text list)
 *  whose first column is also a class name, and requiring the full bin set would report a short-schema
 *  table as ABSENT, which is a true-sounding message about the wrong defect. */
export function committedClassRollup(text: string): CommittedClassRollup | undefined {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === CLASS_ROLLUP_HEADING);
  if (start === -1) {
    return;
  }
  const table = markdownTables(lines.slice(start)).find((candidate) => candidate.columns[0] === "class" && candidate.columns.includes("rows"));
  if (table === undefined) {
    return;
  }
  const present = STATE_BINS.filter((state) => table.columns.includes(state));
  return {
    rows: table.rows.map((row) => committedRow(row, table.columns, present)),
    missingBins: STATE_BINS.filter((state) => !table.columns.includes(state)),
  };
}

/** One committed rollup row. The `**bold**` markers are presentation and are stripped before `Number`,
 *  which is why the TOTAL row (bolded in every cell) parses the same as the class rows. */
function committedRow(row: MarkdownTableRow, columns: readonly string[], present: readonly string[]): ClassRollupRow {
  const cell = (column: string): number => Number((row.cells[columns.indexOf(column)] ?? "").replaceAll("*", "").trim());
  return {
    klass: (row.cells[0] ?? "").replaceAll("*", "").trim(),
    rows: cell("rows"),
    states: Object.fromEntries(present.map((state) => [state, cell(state)])),
  };
}

/** THE `other`-BIN SUB-TABLE, read back out of the `## CLASS ROLLUP` section (#2224, fifth shape).
 *
 *  Below the rollup sits a second table, "free-text class in `other`, as written", that breaks the
 *  `other` bin down by the verbatim class cell and declares its own **`other` TOTAL**. It is a DERIVED
 *  claim about the same body the rollup summarises, and NOTHING re-derived it: measured at the 2026-09-12
 *  barrier it read **176** while `other` was **197**, and on 2026-09-13 it still read 176 while `other` had
 *  reached **241**. It drifts in exactly the way `classRollupDrift` was built to catch one table over, and
 *  it sat inside that arm's blind spot the whole time.
 *
 *  WHAT IS HELD AND WHAT IS NOT, stated rather than discovered. The TOTAL is two-sided and is held: it must
 *  equal the rollup's derived `other` row count. The PER-PHRASE rows are NOT re-derived, and that is a real
 *  limit with a reason — the committed buckets are hand-chosen truncations of the cells (`doc`, `proof`,
 *  `same`, `judgment`, and an explicit *1-offs* bucket folding every singleton), so no mechanical
 *  normalisation reproduces them and a derivation that guessed would fire on the one honest row. The
 *  self-consistency of the table's own arithmetic IS held (its rows must sum to its declared TOTAL), which
 *  is the half that needs no normalisation at all.
 *
 *  IDENTIFIED BY SHAPE, not by its prose heading: a two-column table below the rollup whose second column
 *  is `rows` and whose last body row's first cell says TOTAL. The rollup table itself has nine columns and
 *  the cross-cutting table has three, so neither can be mistaken for it. */
export interface OtherClassCensus {
  /** The sub-table's bolded `other TOTAL` cell, presentation markers stripped. */
  readonly declaredTotal: number;
  /** The sum of the table's own per-phrase row counts — its internal arithmetic. */
  readonly rowsSummed: number;
  /** 1-based line of the TOTAL row, so a drift line points at the cell to edit. */
  readonly line: number;
}

/** A cell's number with the `**bold**` presentation stripped — the same rule `committedRow` uses. */
function cellNumber(cell: string): number {
  return Number(cell.replaceAll("*", "").replaceAll("`", "").trim());
}

export function committedOtherClassCensus(text: string): OtherClassCensus | undefined {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === CLASS_ROLLUP_HEADING);
  if (start === -1) {
    return;
  }
  const TwoColumns = 2;
  const table = markdownTables(lines.slice(start), start + 1).find(
    (candidate) => candidate.columns.length === TwoColumns && candidate.columns[1] === "rows" && totalRowOf(candidate) !== undefined,
  );
  const total = table === undefined ? undefined : totalRowOf(table);
  if (table === undefined || total === undefined) {
    return;
  }
  return {
    declaredTotal: cellNumber(total.cells[1] ?? ""),
    rowsSummed: table.rows.filter((row) => row !== total).reduce((sum, row) => sum + cellNumber(row.cells[1] ?? ""), 0),
    line: total.line,
  };
}

/** The table's own TOTAL row — the body row whose FIRST cell names a total. Undefined when it has none,
 *  which is how the finder above tells this table from any other two-column `rows` table. */
function totalRowOf(table: MarkdownTable): MarkdownTableRow | undefined {
  return table.rows.find((row) => (row.cells[0] ?? "").replaceAll("*", "").replaceAll("`", "").trim().toUpperCase().endsWith("TOTAL"));
}

/** THE `other`-BIN SUB-TABLE versus the bin it claims to break down (#2224, fifth shape).
 *
 *  A SECOND DERIVED TABLE THAT NOTHING RE-DERIVED, one row below the one #2207 built this arm for. It reads
 *  "free-text class in `other`, as written", declares its own **`other` TOTAL**, and that total is a claim
 *  about the same body: it must equal the rollup's derived `other` count. Measured at the 2026-09-12 barrier
 *  it read **176** against an `other` of **197**; on 2026-09-13 it still read 176 against **241**. The
 *  reconciler above was blind to it in exactly the way the whole row describes — correct about the table it
 *  reads, silent about the one beside it.
 *
 *  TWO ARMS, AND THE SECOND IS THE ONE THAT NEEDS NO NORMALISATION. (1) declared TOTAL vs the derived bin.
 *  (2) the table's own rows must SUM to its declared total — pure internal arithmetic, so a hand edit that
 *  fixes the total without touching the buckets is still caught. The per-phrase buckets themselves are NOT
 *  re-derived and the limit is stated at `committedOtherClassCensus`: they are hand-chosen truncations of
 *  the class cells with an explicit *1-offs* bucket, and a mechanical normalisation that guessed at them
 *  would fire on the honest rows.
 *
 *  AN ABSENT SUB-TABLE IS NOT A FINDING and produces no drift line: the ledger is free not to carry the
 *  breakdown, and manufacturing a finding out of a table that is not there would fire on every correct
 *  rollup. The distinction between "nothing to check" and "it checked out" is kept by
 *  `committedOtherClassCensus` returning `undefined` rather than a zeroed census — a reader asking the
 *  question gets an answer that cannot be mistaken for a reconciliation.
 *
 *  AND THE DRIFT MESSAGE'S SECOND REMEDY IS HONOURED IN CODE, not merely offered (`DATED_HAND_CENSUS`). A
 *  re-census of ~180 free-text phrases is barrier work, so the message says "re-census, OR mark the table a
 *  DATED hand census with the date it was taken" — and an instrument that offers a remedy it then refuses
 *  to accept is lying in the courteous direction. The banner WAIVES the equality arm and NOTHING ELSE: the
 *  table's own arithmetic still has to hold, and the waiver must carry a DATE, because "this is a snapshot"
 *  is only a defence when the reader can see how old the snapshot is. */
export function otherCensusDrift(text: string, derived: ClassRollup, ledgerRel: string): readonly string[] {
  const derivedOther = derived.rows.find((row) => row.klass === OTHER_CLASS)?.rows ?? 0;
  const census = committedOtherClassCensus(text);
  if (census === undefined) {
    return [];
  }
  const drift: string[] = [];
  if (census.declaredTotal !== derivedOther && !datedHandCensusBanner(text)) {
    drift.push(
      `census ${ledgerRel}:${census.line} the \`${OTHER_CLASS}\` sub-table declares ${census.declaredTotal} but the body's \`${OTHER_CLASS}\` bin holds ${derivedOther} — re-census the free-text classes, or write a line under \`${CLASS_ROLLUP_HEADING}\` reading "DATED HAND CENSUS" with the YYYY-MM-DD it was taken (that waives THIS arm only; the sub-table's own rows must still sum to its TOTAL)`,
    );
  }
  if (census.rowsSummed !== census.declaredTotal) {
    drift.push(
      `census ${ledgerRel}:${census.line} the \`${OTHER_CLASS}\` sub-table's own rows sum to ${census.rowsSummed} and its TOTAL cell says ${census.declaredTotal} — the table disagrees with itself`,
    );
  }
  return drift;
}

/** THE SANCTIONED WAIVER for the equality arm above: a line inside the `## CLASS ROLLUP` section declaring
 *  the sub-table a DATED HAND CENSUS **and carrying the date it was taken**.
 *
 *  BOTH HALVES ARE REQUIRED AND THE DATE IS THE LOAD-BEARING ONE. "It is a hand census" alone is a
 *  permanent excuse — the same shape as a refusal that outlives its blocker. With a date, a reader can
 *  price the staleness themselves, which is the whole content of the claim. The phrase is matched
 *  case-insensitively and the date by ISO shape on the SAME line, so a paragraph that merely mentions
 *  censuses elsewhere in the section cannot waive anything by accident. */
const DATED_HAND_CENSUS = /^.*\bDATED HAND CENSUS\b.*\b\d{4}-\d{2}-\d{2}\b.*$/imu;

function datedHandCensusBanner(text: string): boolean {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === CLASS_ROLLUP_HEADING);
  if (start === -1) {
    return false;
  }
  // The section ENDS at the next `##`: a banner anywhere else in the document is about something else.
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return DATED_HAND_CENSUS.test((end === -1 ? rest : rest.slice(0, end)).join("\n"));
}
