import { expect, test } from "@orb/testkit/node";
import type { SeededIds } from "@orb/testkit/iso";

test("rows", () => {
  const rows = [1, 2];
  expect(rows.every((row) => row > 0)).toBe(true);
  expect(rows.filter((row) => row > 1).every((row) => row > 1)).toBe(true);
  expect(
    Object.values({ a: 1 }).every(
      (count) => count > 0,
    ),
  ).toBe(true);
});
