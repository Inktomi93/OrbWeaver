// @subject packages/client/src/lib/filtered-census.ts
import { filteredCensus } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node";

test("a narrowed roster names its filtered count and its total, a zero included; an unnarrowed one prints the total alone", () => {
  expect(filteredCensus(2, 330, true)).toBe("2 of 330");
  expect(filteredCensus(0, 5, true)).toBe("0 of 5");
  expect(filteredCensus(5, 5, true)).toBe("5 of 5");
  expect(filteredCensus(5, 5, false)).toBe(5);
  expect(filteredCensus(0, 0, false)).toBe(0);
});
