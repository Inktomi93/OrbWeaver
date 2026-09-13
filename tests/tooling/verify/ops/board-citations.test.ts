// The PIN for the `structure:board-citations` verb's SAME-INVOCATION CONTROLS (#2156, folding #2070).
//
// WHY THE CONTROLS ARE THE THING WORTH PINNING. Every way a board reader breaks — an unparsed payload, a
// defaulted field, a stubbed call, an auth failure that returns an empty page — yields "OPEN" or "unknown"
// for every citation, which is byte-identical to a clean bar. The verdict is therefore only worth what the
// controls are worth, and a control that silently stops firing gives back exactly the false green the row
// was filed against. So: each class's control must FIRE against the real snapshot shape, and a control
// that does not fire must THROW rather than let the run print a zero.
//
// THE FOURTH CONTROL — the board being unreachable — cannot be self-inflicted inside the op (the reader
// either answers or throws), so it is pinned here at the production door with an emptied PATH. Its throw
// is what `runTool` turns into exit 2.
import { vi } from "vitest";
import type { BoardStates } from "../../../../tooling/src/verify/lib/board-citations.ts";
import { boardStates } from "../../../../tooling/src/verify/lib/workitem-board-reader.ts";
import type { BoardIssueState } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { CLOSED_CONTROL_ISSUE } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { runControls } from "../../../../tooling/src/verify/ops/board-citations.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function states(rows: readonly (readonly [number, BoardIssueState])[]): BoardStates {
  return new Map<number, BoardIssueState>(rows);
}

const HEALTHY = states([
  [CLOSED_CONTROL_ISSUE, "CLOSED"],
  [2187, "OPEN"],
  [2024, "CLOSED"],
]);

test("all three class controls fire against a healthy snapshot, and each says what it proved", () => {
  const receipts = runControls(HEALTHY);

  expect(receipts.map((row) => row.control)).toEqual(["policy-workitem", "ledger-closure", "roster-reference"]);
  expect(receipts[0]?.proved).toContain(`#${String(CLOSED_CONTROL_ISSUE)} reported CLOSED`);
  // The dangling controls plant one PAST the highest row the board reported, so the number cannot collide
  // with a real row no matter how the board grows.
  expect(receipts[1]?.proved).toContain("absent #2188");
  expect(receipts[2]?.proved).toContain("absent #2188");
});

test("a reader that cannot say CLOSED REFUSES the run — the whole point of #2070", () => {
  // The shape a broken reader actually produces: everything reads OPEN. Without this control the run would
  // report "0 crossed" and exit 0 while knowing nothing.
  const blind = states([
    [CLOSED_CONTROL_ISSUE, "OPEN"],
    [2024, "OPEN"],
  ]);
  expect(() => runControls(blind)).toThrow(/policy-workitem control did not fire[\s\S]*came back OPEN, not CLOSED/);
  expect(() => runControls(blind)).toThrow(/CLOSED_CONTROL_ISSUE|not a verdict/);
});

test("a snapshot with no OPEN row at all refuses rather than skipping the advisory control", () => {
  const allClosed = states([
    [CLOSED_CONTROL_ISSUE, "CLOSED"],
    [2024, "CLOSED"],
  ]);
  expect(() => runControls(allClosed)).toThrow(/no OPEN row at all[\s\S]*board read to distrust/);
});

test("the PRODUCTION board door refuses rather than guessing — with no `gh` reachable it throws", () => {
  // The board-unavailable control. A reader that answered a default on failure would make every run green;
  // driven by emptying the child's PATH rather than by a mock, so the assertion is about the real door.
  vi.stubEnv("PATH", "");
  expect(() => boardStates()).toThrow(/ENOENT/);
});
