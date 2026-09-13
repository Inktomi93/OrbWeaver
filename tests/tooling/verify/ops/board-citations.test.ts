// The PIN for the `structure:board-citations` verb's SAME-INVOCATION CONTROLS (#2156, folding #2070).
//
// WHY THE CONTROLS ARE THE THING WORTH PINNING. Every way a board reader breaks — an unparsed payload, a
// defaulted field, a stubbed call, an auth failure that returns an empty page — yields "OPEN" or "unknown"
// for every citation, which is byte-identical to a clean bar. The verdict is therefore only worth what the
// controls are worth, and a control that silently stops firing gives back exactly the false green the row
// was filed against. So: each class's control must FIRE against the real snapshot shape, and a control
// that does not fire must THROW rather than let the run print a zero.
//
// THE SOURCE-ADMISSION ARMS AT THE BOTTOM ARE THE OTHER HALF (codex review F2, 2026-09-13). The controls
// above run against SYNTHETIC documents, which prove the algorithm and cannot prove that the CONFIGURED
// production ledger and rosters were admitted — renaming the real ledger's `state` column erased the whole
// class and still exited 0. So the real documents named by `LEDGERS`/`ROSTERS` are passed through the
// source assertions here, and a renamed column on a real document's bytes is proved to throw.
//
// THE REMAINING CONTROL — the board being unreachable — cannot be self-inflicted inside the op (the reader
// either answers or throws), so it is pinned here at the production door with an emptied PATH. Its throw
// is what `runTool` turns into exit 2.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import type { BoardStates } from "../../../../tooling/src/verify/lib/board-citations.ts";
import { assertLedgerSource, assertRosterSource } from "../../../../tooling/src/verify/lib/citation-sources.ts";
import { boardStates } from "../../../../tooling/src/verify/lib/workitem-board-reader.ts";
import { CLOSED_CONTROL_ISSUE } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { LEDGERS, ROSTERS, runControls } from "../../../../tooling/src/verify/ops/board-citations.ts";
import type { BoardIssueRow } from "../../../../tooling/src/workboard/contract/types.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The subject the healthy snapshot's one declaring row announces — the subject control's real input. */
const DECLARED = "cb-v-parity-instruments L4";

function row(number: number, state: BoardIssueRow["state"], body = ""): BoardIssueRow {
  return { number, state, title: `row #${String(number)}`, body, onBoard: true };
}

function states(rows: readonly BoardIssueRow[]): BoardStates {
  return new Map(rows.map((entry) => [entry.number, entry]));
}

const HEALTHY = states([
  row(CLOSED_CONTROL_ISSUE, "CLOSED"),
  row(2187, "OPEN"),
  row(2024, "CLOSED"),
  row(2114, "CLOSED", `**Where:** ${DECLARED} · \`tooling/src/verify/gates/conversion-refusal-liveness.ts:161\``),
]);

test("every class control fires against a healthy snapshot, and each says what it proved", () => {
  const receipts = runControls(HEALTHY);

  expect(receipts.map((receipt) => receipt.control)).toEqual(["policy-workitem", "ledger-closure", "roster-reference", "ledger-subject"]);
  expect(receipts[0]?.proved).toContain(`#${String(CLOSED_CONTROL_ISSUE)} reported CLOSED`);
  // The dangling controls plant one PAST the highest row the board reported, so the number cannot collide
  // with a real row no matter how the board grows.
  expect(receipts[1]?.proved).toContain("absent #2188");
  expect(receipts[2]?.proved).toContain("absent #2188");
  // BOTH DIRECTIONS of the subject arm, against the snapshot's real declaring row.
  expect(receipts[3]?.proved).toContain(`#2114 declares \`${DECLARED}\``);
  expect(receipts[3]?.proved).toContain("was SILENT");
  expect(receipts[3]?.proved).toContain("crossed");
});

test("a reader that cannot say CLOSED REFUSES the run — the whole point of #2070", () => {
  // The shape a broken reader actually produces: everything reads OPEN. Without this control the run would
  // report "0 crossed" and exit 0 while knowing nothing.
  const blind = states([row(CLOSED_CONTROL_ISSUE, "OPEN"), row(2024, "OPEN")]);
  expect(() => runControls(blind)).toThrow(/policy-workitem control did not fire[\s\S]*came back OPEN, not CLOSED/);
  expect(() => runControls(blind)).toThrow(/CLOSED_CONTROL_ISSUE|not a verdict/);
});

test("a snapshot with no OPEN row at all refuses rather than skipping the advisory control", () => {
  const allClosed = states([row(CLOSED_CONTROL_ISSUE, "CLOSED"), row(2024, "CLOSED")]);
  expect(() => runControls(allClosed)).toThrow(/no OPEN row at all[\s\S]*board read to distrust/);
});

test("a snapshot where NO row declares a subject refuses — the subject arm would be unreachable", () => {
  // The blindness this arm exists for: if the ingress grammar moves, the join silently stops discriminating
  // and every crossed citation reads clean again. A control that cannot be planted is not a clean run.
  const noSubjects = states([row(CLOSED_CONTROL_ISSUE, "CLOSED"), row(2187, "OPEN"), row(2024, "CLOSED")]);
  expect(() => runControls(noSubjects)).toThrow(/NOT ONE board row declares a `\*\*Where:\*\*` subject/);
});

test("the CONFIGURED production documents are admitted, and a renamed column on their real bytes throws", ({ repoRoot }) => {
  // NOT a synthetic stand-in: these are the exact paths the verb reads, so a rename, a lost fence or a
  // rewritten citation grammar in the real tree reds HERE rather than printing a clean zero at the barrier.
  for (const rel of LEDGERS) {
    const doc = { rel, text: readFileSync(join(repoRoot, rel), "utf8") };
    expect(assertLedgerSource(doc)).toBeGreaterThan(0);
    expect(() => assertLedgerSource({ rel, text: doc.text.replaceAll("| state |", "| status |") })).toThrow(/with NO `state` column/);
    // THE PARTIAL DRIFT, on the real document's bytes: renaming the column in only SOME in-fence tables is
    // the false exit 0 a count floor cannot see (150 of 399 admitted, serene receipt). Schema admission can.
    const half = doc.text.split("| state | receipt |");
    expect(half.length).toBeGreaterThan(2);
    expect(() => assertLedgerSource({ rel, text: `${half[0] ?? ""}| status | receipt |${half.slice(1).join("| state | receipt |")}` })).toThrow(
      /in-fence defect-row table\(s\) with NO `state` column/,
    );
  }
  for (const rel of ROSTERS) {
    const doc = { rel, text: readFileSync(join(repoRoot, rel), "utf8") };
    expect(assertRosterSource(doc)).toBeGreaterThan(0);
    expect(() => assertRosterSource({ rel, text: doc.text.replaceAll(/#\d{2,5}/gu, "(no id)") })).toThrow(/ZERO table-cell citations/);
  }
});

test("the PRODUCTION board door refuses rather than guessing — with no `gh` reachable it throws", () => {
  // The board-unavailable control. A reader that answered a default on failure would make every run green;
  // driven by emptying the child's PATH rather than by a mock, so the assertion is about the real door.
  vi.stubEnv("PATH", "");
  expect(() => boardStates()).toThrow(/ENOENT/);
});
