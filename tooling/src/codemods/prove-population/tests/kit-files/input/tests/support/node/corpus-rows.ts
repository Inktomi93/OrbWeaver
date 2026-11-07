import { expect, test } from "./fixtures.ts";
import { forEachNonEmpty } from "../iso/non-empty.ts";

test("rows", () => {
  const rows = [{ id: "a" }];
  forEachNonEmpty(rows, "rows", () => undefined);
  expect(rows.every((row) => row.id !== "")).toBe(true);
  expect(rows[0]?.id).not.toBe("");
});
