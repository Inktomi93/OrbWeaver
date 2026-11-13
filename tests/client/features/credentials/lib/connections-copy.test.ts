// The connection row's background line, pinned arm by arm, so a swapped arm cannot read "on" for a connection kept off.
import { expect, test } from "@orb/testkit/node";
import { backgroundStateLabel } from "#client/features/credentials/lib/connections-copy.ts";

test("an allowed connection reads on and a withheld one reads off", () => {
  expect([backgroundStateLabel(true), backgroundStateLabel(false)]).toEqual(["Background work on", "Background work off"]);
});
