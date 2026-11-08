import { expect, test } from "@orb/testkit/node";
import type { SeededIds } from "@orb/testkit/iso";
import { nonEmpty } from "@orb/testkit/iso";

test("rows", () => {
  const rows = [1, 2];
  expect(nonEmpty(rows).every((row) => row > 0)).toBe(true);
  expect(nonEmpty(rows.filter((row) => row > 1)).every((row) => row > 1)).toBe(true);
  expect(
    nonEmpty(Object.values({ a: 1 })).every(
      (count) => count > 0,
    ),
  ).toBe(true);
});
