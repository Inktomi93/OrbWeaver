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
//   • THE SUBJECT JOIN (added 2026-09-13 on codex's review). Resolution alone is blind to #2156's founding
//     defect — #2153 crossed two ids that BOTH exist. Both directions are below: the same-wave sibling
//     CROSSES, the correct subject is SILENT, a different wave is ADVISORY.
//
// THE DOCUMENT READERS AND THEIR SOURCE-SCHEMA REFUSALS moved to `lib/citation-sources.ts` with the
// 2026-09-13 security review's fence-span and schema-admission repairs; their pin is beside them. Every
// fixture here carries the PRODUCTION schema (`defect` + `state`), because a fixture the real admission
// rule would reject proves nothing about the real ledger.
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { BoardCitationsOutcome, BoardStates } from "../../../../tooling/src/verify/lib/board-citations.ts";
import {
  assertSubjectJoinMeasured,
  boardCitationsExit,
  boardCitationsReport,
  judgeBoardCitations,
} from "../../../../tooling/src/verify/lib/board-citations.ts";
import type { CitedDocument } from "../../../../tooling/src/verify/lib/citation-sources.ts";
import type { BoardIssueRow } from "../../../../tooling/src/workboard/contract/types.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const OPEN_ROW = 2187;
const CLOSED_ROW = 2024;
const ABSENT_ROW = 999_999;
const OFF_BOARD_ROW = 4242;
/** The three rows of #2156's founding crossing, with the SUBJECT each one really declares. */
const SUBJECT_L5 = 2116;
const SUBJECT_L4 = 2114;
const OTHER_WAVE = 2150;

function row(number: number, state: BoardIssueRow["state"], body = "", onBoard = true): BoardIssueRow {
  return { number, state, title: `row #${String(number)}`, body, onBoard };
}

const STATES: BoardStates = new Map<number, BoardIssueRow>([
  [1, row(1, "CLOSED")],
  [CLOSED_ROW, row(CLOSED_ROW, "CLOSED")],
  [OPEN_ROW, row(OPEN_ROW, "OPEN")],
  [1584, row(1584, "OPEN")],
  [OFF_BOARD_ROW, row(OFF_BOARD_ROW, "OPEN", "", false)],
  [SUBJECT_L5, row(SUBJECT_L5, "CLOSED", "**Where:** cb-v-parity-instruments L5 · `tooling/src/verify/contract/population.ts:74`")],
  [SUBJECT_L4, row(SUBJECT_L4, "CLOSED", "**Where:** cb-v-parity-instruments L4 · `tooling/src/verify/gates/conversion-refusal-liveness.ts:161`")],
  [OTHER_WAVE, row(OTHER_WAVE, "CLOSED", "**Where:** cb-v-fix-wave-1 L1 · `docs/design/gate-runtime-read-first.md:51`")],
]);

/** A descriptor carrying only the fields the citation derivation reads. */
function policy(id: string, workItem?: number): GatePolicy {
  const severity = workItem === undefined ? { severity: "error" as const } : { severity: "warning" as const, workItem };
  // @orb-waive no-test-fabrication(GatePolicy): partial fixture — only the fields the citation checker exercises; no factory exists
  return { id, ...severity } as GatePolicy;
}

function ledger(...rows: readonly string[]): CitedDocument {
  return { rel: "ledger.md", text: ["## THE LEDGER", "", "| module | defect | state |", "| - | - | - |", ...rows, ""].join("\n") };
}

/** The PRODUCTION ledger schema, header for header — the shape the source-grammar arms have to be judged
 *  against, because a synthetic three-column stand-in cannot show that the real document was admitted. */
function waveLedger(...rows: readonly string[]): CitedDocument {
  return {
    rel: "wave-ledger.md",
    text: ["## THE LEDGER", "", "| module | wave · `path:line` | defect | class | state | receipt |", "| - | - | - | - | - | - |", ...rows, ""].join("\n"),
  };
}

/** One production-shaped defect row: `<subject>` in the wave column, `#<issue>` in the state cell. */
function waveRow(subject: string, issue: number, verdict = "CLOSED"): string {
  return `| a-module | ${subject} · \`src/x.ts:1\` | the defect | other | **${verdict}** — \`abc1234\` (board #${String(issue)}) | the receipt |`;
}

function roster(...rows: readonly string[]): CitedDocument {
  return { rel: "roster.md", text: ["| Gate | Enforces |", "| - | - |", ...rows, ""].join("\n") };
}

const NO_DOCS: readonly CitedDocument[] = [];
const NO_POLICIES: readonly GatePolicy[] = [];

function judgeLedger(doc: CitedDocument): BoardCitationsOutcome {
  return judgeBoardCitations({ policies: NO_POLICIES, ledgers: [doc], rosters: NO_DOCS, states: STATES });
}

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
  expect(boardCitationsReport(outcome)[0]).toContain(`3 citation(s) over ${String(STATES.size)} board row(s)`);
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
  expect(outcome.crossed.map((finding) => finding.citation.citationClass)).toEqual(["ledger-closure", "roster-reference"]);
  expect(boardCitationsReport(outcome).join("\n")).toContain("the board has no row with that number — a citation nobody minted");
});

test("an id that exists but is on NO project is exit 1 — a citation names a BOARD row", () => {
  const outcome = judgeLedger(ledger(`| m | d | **CLOSED** — \`abc1234\` (board #${String(OFF_BOARD_ROW)}) |`));

  expect(boardCitationsExit(outcome)).toBe(1);
  expect(outcome.crossed[0]?.why).toContain("an item of NO project");
});

test("a ledger state disagreement is ADVISORY — censused, reported, and STILL exit 0", () => {
  const outcome = judgeLedger(
    ledger(
      `| a | closed cell, open row | **CLOSED** — \`abc1234\` (board #${String(OPEN_ROW)}) |`,
      `| b | open cell, closed row | **OPEN** (board #${String(CLOSED_ROW)}) |`,
    ),
  );

  // THE ARM THAT MATTERS: the grammar makes `(board #N)` a TRACKING pointer (the sha carries the closure),
  // so one board row spans several cells and legitimately outlives them. Turning this into a red would have
  // landed 62 unadjudicated rows on the barrier's first run.
  expect(boardCitationsExit(outcome)).toBe(0);
  expect(outcome.crossed).toEqual([]);
  expect(outcome.advisory.map((finding) => [finding.verdict, finding.issue, finding.state])).toEqual([
    ["CLOSED", OPEN_ROW, "OPEN"],
    ["OPEN", CLOSED_ROW, "CLOSED"],
  ]);
  const report = boardCitationsReport(outcome).join("\n");
  expect(report).toContain("ADVISORY — 2 ledger cell(s)");
  expect(report).toContain("NOT a verdict");
});

test("a verdict word that claims nothing is COUNTED, never silently dropped", () => {
  const outcome = judgeLedger(
    ledger(`| a | superseded | **SUPERSEDED** — mechanized (#${String(OPEN_ROW)}) |`, `| b | no verdict at all | see #${String(CLOSED_ROW)} |`),
  );

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

test("THE SUBJECT ARM, both directions: the cited row's own subject is silent, a SAME-WAVE sibling is exit 1", () => {
  // #2156's founding defect verbatim (#2153): the ledger's `cb-v-parity-instruments L5` row closed citing
  // #2114, which owns L4. Both ids EXIST, so resolution alone reports zero — this is the arm that does not.
  const silent = judgeLedger(waveLedger(waveRow("cb-v-parity-instruments L5", SUBJECT_L5)));
  expect(boardCitationsExit(silent)).toBe(0);
  expect(silent.subject.matched).toBe(1);

  const crossed = judgeLedger(waveLedger(waveRow("cb-v-parity-instruments L5", SUBJECT_L4)));
  expect(boardCitationsExit(crossed)).toBe(1);
  expect(crossed.subject.crossed).toBe(1);
  expect(crossed.crossed[0]?.why).toContain("cb-v-parity-instruments L4");
  expect(crossed.crossed[0]?.why).toContain("the SAME wave");
});

test("a DIFFERENT wave is ADVISORY, not a verdict — the ledger legitimately tracks a defect on its family's earlier row", () => {
  // Measured on the live tree 2026-09-13: all four cross-family citations read this way ("a NEW instance of
  // #2150's family"). A hard arm here would have shipped four day-one false positives.
  const outcome = judgeLedger(waveLedger(waveRow("cb-v-wave-8c L5", OTHER_WAVE)));

  expect(boardCitationsExit(outcome)).toBe(0);
  expect(outcome.subject["cross-family"]).toBe(1);
  expect(outcome.subjectNotes[0]?.declared).toBe("cb-v-fix-wave-1 L1");
  expect(boardCitationsReport(outcome).join("\n")).toContain("[cross-family]");
});

test("a cited row that DECLARES NO subject is counted, never judged — the residue that keeps #2156 open", () => {
  const outcome = judgeLedger(waveLedger(waveRow("cb-v-parity-instruments L5", 1584)));

  expect(boardCitationsExit(outcome)).toBe(0);
  expect(outcome.subject.undeclared).toBe(1);
  expect(outcome.subjectNotes).toEqual([]);
  expect(boardCitationsReport(outcome).join("\n")).toContain("undeclared 1");
});

test("assertSubjectJoinMeasured REFUSES a run whose subject join matched nothing", () => {
  const undeclaredOnly = judgeLedger(waveLedger(waveRow("cb-v-parity-instruments L5", 1584)));
  expect(() => assertSubjectJoinMeasured(undeclaredOnly)).toThrow(/subject join matched ZERO citations/);

  const measured = judgeLedger(waveLedger(waveRow("cb-v-parity-instruments L5", SUBJECT_L5)));
  expect(() => assertSubjectJoinMeasured(measured)).not.toThrow();
});
