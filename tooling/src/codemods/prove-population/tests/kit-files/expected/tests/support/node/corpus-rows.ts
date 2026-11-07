import { expect, test } from "./fixtures.ts";
import { forEachNonEmpty, nonEmpty, present } from "../iso/non-empty.ts";

test("rows", () => {
  const rows = [{ id: "a" }];
  forEachNonEmpty(rows, "rows", () => undefined);
  expect(nonEmpty(rows).every((row) => row.id !== "")).toBe(true);
  expect(present(rows[0]).id).not.toBe("");
});
