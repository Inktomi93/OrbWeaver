import type { SeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("rows", async () => {
  const rows = [1, 2];
  expect(rows.some((row) => row > 2)).toBe(false);
  expect(rows.some((row) => row > 2), "no row passes two").toBe(false);
  expect((await load()).some((row) => row > 2)).toBe(false);
  expect(rows.some((row) => row > 2)).toBeFalsy();
  expect(rows.some((row) => row > 2)).not.toBe(true);
  expect(rows.some((row) => row > 2)).not.toBeTruthy();
  expect(rows.some((row) => row > 2)).toEqual(false);
  expect(rows.some((row) => row > 0)).toBe(true);
  expect(rows.some((row) => row > 0)).not.toBe(false);
});
