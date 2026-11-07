import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("rows", () => {
  const rows = [{ id: "a", nested: { deep: "b" } }];
  const before = rows[0];
  expect(rows[0]?.id).not.toBe(before?.id);
  expect(rows.find((row) => row.id === "a")?.nested?.deep).not.toContain("c");
  expect(rows[0]?.nested.deep).not.toBeNull();
  expect(createFrozenClock().now).not.toBe(0);
  expect(rows[0]?.id).toBe("a");
  expect(rows.find((row) => row?.id === "a")?.id).not.toBe("b");
  expect(unsafe?.evidence.every((row) => row.ok)).toBe(true);
});
