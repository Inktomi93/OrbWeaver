// The PIN for board-citation reconciliation (#2156, folding #2070). What each arm defends:
//
//   • THE THREE OUTCOMES, separately: every citation resolving (and every openness claim holding) is 0; a
//     crossed citation is 1 naming class · site · id · the state that contradicts it; anything the run
//     cannot measure THROWS, which the runner turns into exit 2.
//   • THE CLASS GRAMMARS, which are the design and were each measured before being built. A warning
//     policy's `workItem` CLAIMS OPENNESS, so a closed row is a finding. A ledger cell's `(board #N)` is a
//     TRACKING pointer — the playbook's own sentence — so a state disagreement is ADVISORY and only a
//     DANGLING id is a finding. A roster `#N` is an ORIGIN citation, so likewise: resolution only.
//   • THE ADVISORY IS NOT A VERDICT. The arm below asserts a run with disagreements and no dangling id
//     exits 0 — because the opposite shipped as a red would have put 62 unadjudicated rows on a barrier the
//     first time it ran, and an instrument whose red an operator has to ignore is an instrument bypassed.
//   • THE DENOMINATORS. A class that silently stops matching (a renamed column, a changed cell shape) is
//     invisible in a finding count, so `perClass` is asserted with the citations.
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { BoardStates, CitedDocument } from "../../../../tooling/src/verify/lib/board-citations.ts";
import {
  boardCitationsExit,
  boardCitationsReport,
  judgeBoardCitations,
  ledgerCitations,
  rosterCitations,
} from "../../../../tooling/src/verify/lib/board-citations.ts";
import type { BoardIssueState } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const OPEN_ROW = 2187;
const CLOSED_ROW = 2024;
const ABSENT_ROW = 999_999;

const STATES: BoardStates = new Map<number, BoardIssueState>([
  [1, "CLOSED"],
  [CLOSED_ROW, "CLOSED"],
  [OPEN_ROW, "OPEN"],
  [1584, "OPEN"],
]);

/** A descriptor carrying only the fields the citation derivation reads. */
function policy(id: string, workItem?: number): GatePolicy {
  const severity = workItem === undefined ? { severity: "error" as const } : { severity: "warning" as const, workItem };
  return { id, ...severity } as GatePolicy;
}

function ledger(...rows: readonly string[]): CitedDocument {
  return { rel: "ledger.md", text: ["## THE LEDGER", "", "| module | defect | state |", "| - | - | - |", ...rows, ""].join("\n") };
}

function roster(...rows: readonly string[]): CitedDocument {
  return { rel: "roster.md", text: ["| Gate | Enforces |", "| - | - |", ...rows, ""].join("\n") };
}

const NO_DOCS: readonly CitedDocument[] = [];
const NO_POLICIES: readonly GatePolicy[] = [];

test("a clean tree is exit 0, and the per-class denominators are reported with it", () => {
  const outcome = judgeBoardCitations({
    policies: [policy("live-debt", OPEN_ROW), policy("an-error-policy")],
    ledgers: [ledger(`| m | d | **CLOSED** — \`abc1234\` (board #${String(CLOSED_ROW)}) |`)],
    rosters: [roster(`| g | issue #${String(OPEN_ROW)} — the origin row |`)],
    states: STATES,
  });

  expect(outcome.crossed).toEqual([]);
  expect(boardCitationsExit(outcome)).toBe(0);
  expect(outcome.perClass).toEqual({ "policy-workitem": 1, "ledger-closure": 1, "roster-reference": 1 });
  expect(outcome.boardRows).toBe(STATES.size);
  expect(boardCitationsReport(outcome)[0]).toContain("3 citation(s) over 4 board row(s)");
});

test("a warning policy naming a CLOSED row is exit 1 — the one class that claims openness", () => {
  const outcome = judgeBoardCitations({ policies: [policy("stale-debt", CLOSED_ROW)], ledgers: NO_DOCS, rosters: NO_DOCS, states: STATES });

  expect(boardCitationsExit(outcome)).toBe(1);
  expect(outcome.crossed).toHaveLength(1);
  expect(outcome.crossed[0]?.citation.site).toBe("stale-debt");
  expect(outcome.crossed[0]?.state).toBe("CLOSED");
  const report = boardCitationsReport(outcome).join("\n");
  expect(report).toContain("[policy-workitem] stale-debt cites #2024");
  expect(report).toContain("the site claims this row is OPEN and owns the work; the board says CLOSED");
});

test("a DANGLING id is exit 1 in either document class — the hard arm the tracking grammar still supports", () => {
  const outcome = judgeBoardCitations({
    policies: NO_POLICIES,
    ledgers: [ledger(`| m | d | **CLOSED** — \`abc1234\` (board #${String(ABSENT_ROW)}) |`)],
    rosters: [roster(`| g | issue #${String(ABSENT_ROW)} |`)],
    states: STATES,
  });

  expect(boardCitationsExit(outcome)).toBe(1);
  expect(outcome.crossed.map((row) => row.citation.citationClass)).toEqual(["ledger-closure", "roster-reference"]);
  expect(boardCitationsReport(outcome).join("\n")).toContain("the board has no row with that number — a citation nobody minted");
});

test("a ledger state disagreement is ADVISORY — censused, reported, and STILL exit 0", () => {
  const outcome = judgeBoardCitations({
    policies: NO_POLICIES,
    ledgers: [
      ledger(
        `| a | closed cell, open row | **CLOSED** — \`abc1234\` (board #${String(OPEN_ROW)}) |`,
        `| b | open cell, closed row | **OPEN** (board #${String(CLOSED_ROW)}) |`,
      ),
    ],
    rosters: NO_DOCS,
    states: STATES,
  });

  // THE ARM THAT MATTERS: the grammar makes `(board #N)` a TRACKING pointer (the sha carries the closure),
  // so one board row spans several cells and legitimately outlives them. Turning this into a red would have
  // landed 62 unadjudicated rows on the barrier's first run.
  expect(boardCitationsExit(outcome)).toBe(0);
  expect(outcome.crossed).toEqual([]);
  expect(outcome.advisory.map((row) => [row.verdict, row.issue, row.state])).toEqual([
    ["CLOSED", OPEN_ROW, "OPEN"],
    ["OPEN", CLOSED_ROW, "CLOSED"],
  ]);
  const report = boardCitationsReport(outcome).join("\n");
  expect(report).toContain("ADVISORY — 2 ledger cell(s)");
  expect(report).toContain("NOT a verdict");
});

test("a verdict word that claims nothing is COUNTED, never silently dropped", () => {
  const outcome = judgeBoardCitations({
    policies: NO_POLICIES,
    ledgers: [ledger(`| a | superseded | **SUPERSEDED** — mechanized (#${String(OPEN_ROW)}) |`, `| b | no verdict at all | see #${String(CLOSED_ROW)} |`)],
    rosters: NO_DOCS,
    states: STATES,
  });

  expect(outcome.verdictless).toBe(2);
  expect(outcome.advisory).toEqual([]);
  expect(boardCitationsExit(outcome)).toBe(0);
  expect(boardCitationsReport(outcome)[0]).toContain("2 cell(s) whose verdict claims nothing");
});

test("an EMPTY board snapshot refuses — every citation would read as dangling", () => {
  expect(() => judgeBoardCitations({ policies: [policy("x", OPEN_ROW)], ledgers: NO_DOCS, rosters: NO_DOCS, states: new Map() })).toThrow(
    /board snapshot is EMPTY[\s\S]*not a verdict/,
  );
});

test("the readers are column- and fence-aware: a non-state column and a pre-fence table contribute nothing", () => {
  // The ledger's own sections do NOT share a schema (`p-suite-honesty`'s is `subject|defect|class|state|receipt`),
  // so the state column is found BY NAME off each table's header; a table without one is not guessed at.
  const noStateColumn: CitedDocument = { rel: "ledger.md", text: ["## THE LEDGER", "", "| module | receipt |", "| - | - |", "| m | #2187 |", ""].join("\n") };
  expect(ledgerCitations(noStateColumn)).toEqual([]);

  // Rows ABOVE `## THE LEDGER` are the summary and rollup tables, not defect rows.
  const preFence: CitedDocument = {
    rel: "ledger.md",
    text: [
      "| module | state |",
      "| - | - |",
      "| summary | **OPEN** #2187 |",
      "",
      "## THE LEDGER",
      "",
      "| module | state |",
      "| - | - |",
      "| real | **OPEN** #1584 |",
      "",
    ].join("\n"),
  };
  expect(ledgerCitations(preFence).map(({ citation }) => citation.issue)).toEqual([1584]);

  // The roster reads EVERY cell — its citations sit in the `Enforces` prose, not in a dedicated column.
  expect(rosterCitations(roster("| g | issue #2187 — origin, and #1584 the program |")).map(({ issue }) => issue)).toEqual([2187, 1584]);
});
