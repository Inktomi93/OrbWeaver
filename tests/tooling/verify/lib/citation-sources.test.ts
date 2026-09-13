// The PIN for the CITED-DOCUMENT READERS (#2156) — the half that turns authored markdown into citations,
// split out of `lib/board-citations.ts` with the 2026-09-13 security review's N1/N2 repairs.
//
// EVERY ARM HERE IS A WAY THE POPULATION COULD BE WRONG IN THE DIRECTION NOBODY CHECKS — too many rows, or
// too few, with the report reading serene either way:
//
//   • THE FENCE IS A SPAN. It used to be `findIndex("## THE LEDGER")` with no end, so `## CLASS ROLLUP`'s
//     cross-cutting table entered the class-2 population — 6 citations over 5 rows of PROSE mentions, judged
//     for resolution and board membership like real `(board #N)` pointers. The control below plants the same
//     state-bearing table on BOTH sides of the closing `##` and asserts only the in-fence one is read.
//   • ADMISSION IS BY SCHEMA, AND HALF A SCHEMA REFUSES. Keying only on `state` made every non-vacuity
//     guard a floor of ONE: renaming `| state |` in the tables that hold no declaring row admitted 150 of
//     399 citations on the real ledger and EXITED 0 with 249 unread. A table naming one of `defect`/`state`
//     and not the other is drift, in both rename directions.
//   • THE NON-VACUITY GUARDS THEMSELVES, both documents, in the refusing and the admitting direction.
import type { CitedDocument } from "../../../../tooling/src/verify/lib/citation-sources.ts";
import { assertLedgerSource, assertRosterSource, ledgerCitations, ledgerSpan, rosterCitations } from "../../../../tooling/src/verify/lib/citation-sources.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The production defect-row schema, header for header. */
const HEADER = "| module | wave · `path:line` | defect | class | state | receipt |";
const RULE = "| - | - | - | - | - | - |";

function row(issue: number, subject = "cb-v-x L1", verdict = "CLOSED"): string {
  return `| a-module | ${subject} · \`src/x.ts:1\` | the defect | other | **${verdict}** — \`abc1234\` (board #${String(issue)}) | the receipt |`;
}

function doc(...lines: readonly string[]): CitedDocument {
  return { rel: "ledger.md", text: [...lines, ""].join("\n") };
}

/** A ledger whose defect rows sit inside the fence, exactly as the real document is authored. */
function ledger(...rows: readonly string[]): CitedDocument {
  return doc("# A ledger", "", "## THE LEDGER", "", HEADER, RULE, ...rows);
}

function roster(...rows: readonly string[]): CitedDocument {
  return { rel: "roster.md", text: ["| Gate | Enforces |", "| - | - |", ...rows, ""].join("\n") };
}

test("the fence is a SPAN: `## THE LEDGER` to the next `##`, both ends exclusive", () => {
  const lines = ["# title", "", "## THE LEDGER", "", HEADER, RULE, row(1584), "", "## CLASS ROLLUP", "", "| a | b |"];
  expect(ledgerSpan(lines)).toEqual({ start: 3, end: 9 });
  // A ledger that is the document's LAST section runs to the end rather than refusing.
  expect(ledgerSpan(["## THE LEDGER", "", HEADER])).toEqual({ start: 1, end: 4 });
  expect(ledgerSpan(["# nothing here"])).toBeUndefined();
});

test("A STATE-BEARING TABLE BELOW THE CLOSING `##` CONTRIBUTES NOTHING — and the identical table above it DOES", () => {
  // THE N1 CONTROL, both directions. The rollup section carries its own `class | modules affected | state`
  // table whose cells are PROSE mentions ("#2000's §4.6 differential"), not `(board #N)` tracking pointers.
  // Reading them as citations judged them for resolution and BOARD MEMBERSHIP, so the first rollup sentence
  // naming an unminted or off-board number would have been a hard exit 1 on a non-citation.
  const rollup = [HEADER, RULE, row(9001, "cb-v-x L9")];
  const below = doc("## THE LEDGER", "", HEADER, RULE, row(1584), "", "## CLASS ROLLUP", "", ...rollup);
  expect(ledgerCitations(below).map(({ citation }) => citation.issue)).toEqual([1584]);

  // THE SAME TABLE, byte for byte, moved ABOVE the closing heading IS read — so the arm discriminates on
  // the fence and not on the table's schema, its position in the file or its contents.
  const above = doc("## THE LEDGER", "", HEADER, RULE, row(1584), "", ...rollup, "", "## CLASS ROLLUP");
  expect(ledgerCitations(above).map(({ citation }) => citation.issue)).toEqual([1584, 9001]);
});

test("rows ABOVE the fence heading are excluded — including the line immediately above it", () => {
  // The off-by-one the span repair also closes: the old comparison was a 0-based `findIndex` against a
  // 1-based `row.line`, which admitted the row one line ABOVE the heading.
  const preFence = doc(
    "| module | defect | state |",
    "| - | - | - |",
    "| summary | the rollup | **OPEN** #2187 |",
    "## THE LEDGER",
    "",
    HEADER,
    RULE,
    row(1584),
  );
  expect(ledgerCitations(preFence).map(({ citation }) => citation.issue)).toEqual([1584]);
});

test("admission is by SCHEMA: a table naming both `defect` and `state` is read, one naming neither is not", () => {
  const noPair = doc("## THE LEDGER", "", "| module | receipt |", "| - | - |", "| m | tracked at #2187 |");
  expect(ledgerCitations(noPair)).toEqual([]);
  expect(ledgerCitations(ledger(row(2187))).map(({ citation }) => citation.issue)).toEqual([2187]);
});

test("ledger admission refuses escaped and separator-less top-level row paragraphs beside a healthy table", () => {
  const escaped = doc("## THE LEDGER", "", HEADER, RULE, row(2187), "", "\\| module | defect | state |", "\\| lost | orphan | **OPEN** (board #9998) |");
  expect(() => ledgerCitations(escaped)).toThrow(/ledger\.md:7.*table-like row is a Markdown paragraph/);
  expect(() => assertLedgerSource(escaped)).toThrow(/ledger\.md:7.*table-like row is a Markdown paragraph/);

  const separatorless = doc("## THE LEDGER", "", HEADER, RULE, row(2187), "", "| module | defect | state |", "| lost | orphan | **OPEN** (board #9999) |");
  expect(() => ledgerCitations(separatorless)).toThrow(/ledger\.md:7.*table-like row is a Markdown paragraph/);
  expect(() => assertLedgerSource(separatorless)).toThrow(/ledger\.md:7.*table-like row is a Markdown paragraph/);
});

test("a partially decoded GFM table refuses instead of dropping an unsupported row and its successors", () => {
  const middle = row(9998);
  for (const unsupported of [`\\${middle}`, middle.replaceAll("| ", "|"), middle.slice(2)]) {
    const partial = ledger(row(2187), unsupported, row(9999));
    expect(() => ledgerCitations(partial)).toThrow(/top-level GFM table whose authored spelling the ledger cell reader cannot preserve/);
    expect(() => assertLedgerSource(partial)).toThrow(/top-level GFM table whose authored spelling the ledger cell reader cannot preserve/);
  }
  const complete = ledger(row(2187), middle, row(9999));
  expect(ledgerCitations(complete).map(({ citation }) => citation.issue)).toEqual([2187, 9998, 9999]);
  expect(assertLedgerSource(complete)).toBe(3);
});

test("only top-level GFM tables are ledger evidence; code, quotes, indented code and prose remain examples", () => {
  const examples = doc(
    "## THE LEDGER",
    "",
    HEADER,
    RULE,
    row(2187),
    "",
    "```md",
    HEADER,
    RULE,
    row(9999),
    "```",
    "",
    `> ${HEADER}`,
    `> ${RULE}`,
    `> ${row(9998)}`,
    "",
    `    ${HEADER}`,
    `    ${RULE}`,
    `    ${row(9997)}`,
    "",
    "Ordinary prose can compare left | right without becoming ledger evidence.",
  );
  expect(ledgerCitations(examples).map(({ citation }) => citation.issue)).toEqual([2187]);
  expect(assertLedgerSource(examples)).toBe(1);
});

test("heading fences also come from the root AST, and unsupported GFM table spellings refuse", () => {
  const fakeFence = doc("```md", "## THE LEDGER", "## CLASS ROLLUP", "```", "", "> ## THE LEDGER", "", "## THE LEDGER", "", HEADER, RULE, row(2187));
  expect(ledgerSpan(fakeFence.text.split("\n"))).toEqual({ start: 8, end: 14 });
  expect(ledgerCitations(fakeFence).map(({ citation }) => citation.issue)).toEqual([2187]);

  const noOuterPipes = doc("## THE LEDGER", "", "module | defect | state", "--- | --- | ---", "m | d | **OPEN** (board #9999)");
  expect(() => ledgerCitations(noOuterPipes)).toThrow(/top-level GFM table whose authored spelling the ledger cell reader cannot preserve/);
  const indentedTable = doc("## THE LEDGER", "", ` ${HEADER}`, ` ${RULE}`, ` ${row(9998)}`);
  expect(() => ledgerCitations(indentedTable)).toThrow(/top-level GFM table whose authored spelling the ledger cell reader cannot preserve/);
});

test("the row's SUBJECT is read off the `wave`/`lane` column, and a table without one yields citations with no key", () => {
  expect(ledgerCitations(ledger(row(2187, "cb-v-parity-instruments L5")))[0]?.citation.subjectKey).toBe("cb-v-parity-instruments L5");
  const noSubject = doc("## THE LEDGER", "", "| module | defect | state |", "| - | - | - |", "| m | d | **CLOSED** (board #2187) |");
  expect(ledgerCitations(noSubject)[0]?.citation.subjectKey).toBeUndefined();
});

test("assertLedgerSource REFUSES A PARTIAL COLUMN RENAME — the false exit 0 a floor of one cannot see", () => {
  // THE N2 CONTROL. Driven on the real ledger, renaming `| state |` in only the tables that hold no
  // declaring row admitted 150 of 399 citations, printed a serene source receipt and exited 0. A count
  // floor cannot see that; a SCHEMA rule can, because a defect-row table without a `state` is drift.
  const partial = doc(
    "## THE LEDGER",
    "",
    HEADER,
    RULE,
    row(2187),
    "",
    "| module | wave · `path:line` | defect | class | status | receipt |",
    "| - | - | - | - | - | - |",
    row(1584),
  );
  // The reader still admits the untouched table — the drift is not a silent total loss, which is the point.
  expect(ledgerCitations(partial).map(({ citation }) => citation.issue)).toEqual([2187]);
  expect(() => assertLedgerSource(partial)).toThrow(/in-fence defect-row table\(s\) with NO `state` column/);
  // The MIRROR rename is drift too: schema admission would otherwise drop the table just as silently.
  const renamedDefect = doc(
    "## THE LEDGER",
    "",
    "| module | issue | class | state | receipt |",
    "| - | - | - | - | - |",
    "| m | d | other | **CLOSED** (board #2187) | r |",
  );
  expect(() => assertLedgerSource(renamedDefect)).toThrow(/with NO `defect` column/);
  // The admitting direction, so this is a control and not a fence.
  expect(assertLedgerSource(ledger(row(2187)))).toBe(1);
});

test("assertLedgerSource REFUSES a ledger with no fence, no defect-row table, or no citations", () => {
  expect(() => assertLedgerSource(doc("| module | defect | state |", "| - | - | - |", "| m | d | **OPEN** (board #1584) |"))).toThrow(
    /carries no `## THE LEDGER` fence/,
  );
  expect(ledgerCitations(doc("| module | defect | state |", "| - | - | - |", "| m | d | **OPEN** (board #1584) |"))).toEqual([]);

  expect(() => assertLedgerSource(doc("## THE LEDGER", "", "| module | receipt |", "| - | - |", "| m | r |"))).toThrow(/no in-fence table naming both/);
  expect(() => assertLedgerSource(ledger("| a-module | cb-v-x L1 · `src/x.ts:1` | the defect | other | **OPEN**, no row exists | the receipt |"))).toThrow(
    /ZERO state-cell citations/,
  );
});

test("the roster reads EVERY cell, and assertRosterSource refuses a document that parses to nothing", () => {
  expect(rosterCitations(roster("| g | issue #2187 — origin, and #1584 the program |")).map(({ issue }) => issue)).toEqual([2187, 1584]);
  expect(() => assertRosterSource(roster("| g | no citation in this cell |"))).toThrow(/ZERO table-cell citations/);
  expect(assertRosterSource(roster("| g | issue #1584 |"))).toBe(1);
});
