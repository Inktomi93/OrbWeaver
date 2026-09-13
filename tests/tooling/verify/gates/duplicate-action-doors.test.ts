// The #2101 re-cut, pinned: `duplicate-action-doors` rules a NAMED DOOR SET, never a cardinality.
//
// WHY THIS FILE EXISTS AT ALL. The gate's declared `mustFlag`/`mustPass` examples run in the legacy
// conformance substrate over an IN-MEMORY project rooted at a scratch path, so `readBaseline` finds no
// ledger there and every example is judged with NO ruling. That makes the ruled-set arms — the entire
// subject of #2101 — inexpressible as a proof row: an example cannot carry a baseline. The decision is
// therefore lifted into three pure, exported functions and pinned here, which is also what a reader needs
// to see the polarity of each arm side by side.
//
// EVERY ARM IS TWO-SIDED. A row that only proved "the ruled door is silent" would pass just as happily
// against a judge that returned `admitted` for everything, which is exactly the failure the count budget
// shipped for a year: it absolved a third door by arithmetic and nobody could tell, because the green was
// indistinguishable from a green that had checked something.
import type { RatchetRow } from "../../../../tooling/src/_shared/ratchet-rows.ts";
import { countDisagreement, judgePair, staleRuledDoors } from "../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOOR_A = "packages/client/src/features/chat/hooks/use-continue-turn.ts";
const DOOR_B = "packages/client/src/features/chat/hooks/use-guided-actions.ts";
const DOOR_C = "packages/client/src/features/chat/components/message-actions-row.tsx";

/** A ruling shaped like the six live ones: both doors named in `cite`, the numbers alongside as accounting. */
function ruling(cite: readonly string[], count = cite.length): RatchetRow {
  return { subject: "chats::chat.continueTurn", count, ratified: count, debt: 0, why: "#568: two affordance kinds", cite };
}

test("a door the ruling NAMES is admitted, and a door it does not name is the finding — by identity, not by count", () => {
  expect(judgePair(new Set([DOOR_A, DOOR_B]), ruling([DOOR_A, DOOR_B]))).toEqual({ kind: "admitted" });
  expect(judgePair(new Set([DOOR_A, DOOR_C]), ruling([DOOR_A, DOOR_B]))).toEqual({ kind: "new-doors", doors: [DOOR_C] });
});

/** THE DEFECT #2101 NAMES, as its own pin: same cardinality, different doors. A count budget of 2 sees two
 *  doors and two doors, and admits — so a ruled door leaving and an unruled one arriving was a SILENT swap.
 *  The `new-doors` verdict above and the stale cite here are the two halves the number could not express. */
test("a SWAPPED door is caught on both sides, where a cardinality budget saw two doors and two doors", () => {
  const row = ruling([DOOR_A, DOOR_B]);
  const live = new Set([DOOR_A, DOOR_C]);

  expect(judgePair(live, row)).toEqual({ kind: "new-doors", doors: [DOOR_C] });
  expect(staleRuledDoors(live, row)).toEqual([DOOR_B]);
});

test("a THIRD door on a ruled pair names itself — the arm that used to accuse the whole list", () => {
  expect(judgePair(new Set([DOOR_A, DOOR_B, DOOR_C]), ruling([DOOR_A, DOOR_B]))).toEqual({ kind: "new-doors", doors: [DOOR_C] });
});

test("a pair with NO ruling is judged whole, because nothing there identifies which door is new", () => {
  // Seeded out of order on purpose: the whole-list diagnostic is sorted, so its text cannot depend on walk order.
  expect(judgePair(new Set([DOOR_B, DOOR_A]), undefined)).toEqual({ kind: "unruled-pair", doors: [DOOR_A, DOOR_B].toSorted() });
  // A row that carries a budget but names no door rules NOTHING — the count cannot stand in for the ruling.
  expect(judgePair(new Set([DOOR_A, DOOR_B]), ruling([], 2))).toEqual({ kind: "unruled-pair", doors: [DOOR_A, DOOR_B].toSorted() });
});

test("one door is not a duplication — the floor is the class definition, and it is not a budget", () => {
  expect(judgePair(new Set([DOOR_A]), undefined)).toEqual({ kind: "below-floor" });
  expect(judgePair(new Set([DOOR_A]), ruling([DOOR_A, DOOR_B]))).toEqual({ kind: "below-floor" });
});

test("a cite's `§`/`#` prose suffix is stripped through the ONE cite grammar, so a ruled door still matches", () => {
  expect(judgePair(new Set([DOOR_A, DOOR_B]), ruling([`${DOOR_A} §3`, `${DOOR_B}#L20`], 2))).toEqual({ kind: "admitted" });
});

test("the accounting may not tell a second story: a count that disagrees with the named set is RED", () => {
  expect(countDisagreement(ruling([DOOR_A, DOOR_B]))).toBeNull();
  expect(countDisagreement(ruling([DOOR_A, DOOR_B], 3))).toContain("count 3 vs 2 named door(s)");
  // A row naming no door has nothing to disagree with — `judgePair` already refuses to let it rule anything.
  expect(countDisagreement(ruling([], 2))).toBeNull();
});
