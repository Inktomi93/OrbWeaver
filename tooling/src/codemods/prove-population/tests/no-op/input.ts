import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("rows", () => {
  const rows = [1];
  expect(nonEmpty(rows).every((row) => row > 0)).toBe(true);
  expect(rows.some((row) => row > 0)).toBe(true);
  expect(rows[0]).not.toBe(2);
  expect(rows.at(0)?.toFixed()).toBe("1");
  expect(rows.every((row) => row > 0) && rows.length > 0).toBe(true);
});
