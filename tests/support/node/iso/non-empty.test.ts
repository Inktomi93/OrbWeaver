// @subject tests/support/iso/non-empty.ts
import { expect, test } from "vitest";
import { forEachNonEmpty, nonEmpty, present } from "../../iso/non-empty.ts";

test("every row is registered in order, and an empty table throws before any case is registered", () => {
  const seen: number[] = [];
  forEachNonEmpty([1, 2, 3], "numbers", (row) => seen.push(row));
  expect(seen).toEqual([1, 2, 3]);

  const registered: string[] = [];
  expect(() => forEachNonEmpty([], "renamed entries", (row) => registered.push(String(row)))).toThrow("renamed entries");
  expect(registered).toEqual([]);
});

test("a population check refuses an empty list and a missing value, and keeps a falsy value that is present", () => {
  expect(nonEmpty([0])).toEqual([0]);
  expect(() => nonEmpty([])).toThrow("got none");
  expect([0, "", false].map(present)).toEqual([0, "", false]);
  expect(() => present(undefined)).toThrow("got undefined");
  expect(() => present(null)).toThrow("got null");
});
