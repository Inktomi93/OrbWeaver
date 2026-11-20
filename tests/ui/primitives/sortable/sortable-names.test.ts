// The live region's row name, pinned arm by arm: a known rank speaks its position, an unknown one speaks the name alone.
import { expect, test } from "@orb/testkit/node";
import { sortablePositionName } from "../../../../packages/ui/src/primitives/sortable/sortable-names.ts";

test("a ranked row speaks its position of the total, and an unranked row only its name", () => {
  expect([sortablePositionName("Alpha", 2, 4), sortablePositionName("Alpha", null, 4)]).toEqual(["Alpha, position 2 of 4", "Alpha"]);
});
