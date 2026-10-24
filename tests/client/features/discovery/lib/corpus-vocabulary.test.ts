import { expect, test } from "@orb/testkit/node";
import { distilledCensus } from "#client/features/discovery/lib/corpus-vocabulary.ts";

test("the distilled census names its library denominator only while part of the library is undistilled", () => {
  expect(distilledCensus(12, 20)).toBe("12 of 20 distilled");
  expect(distilledCensus(0, 5)).toBe("0 of 5 distilled");
  expect(distilledCensus(12, 12)).toBe("12 distilled");
  // An empty library yields the bare zero the shared band suppresses, not "0 distilled".
  expect(distilledCensus(0, 0)).toBe(0);
});
