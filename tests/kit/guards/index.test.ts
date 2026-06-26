import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "vitest";

test("isPlainObject is true for non-null, non-array objects", () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject({ a: 1 })).toBe(true);
});

test("isPlainObject is false for null, arrays, and primitives", () => {
  expect(isPlainObject(null)).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject([1, 2])).toBe(false);
  expect(isPlainObject("str")).toBe(false);
  expect(isPlainObject(5)).toBe(false);
  expect(isPlainObject(undefined)).toBe(false);
});

test("isPlainObject narrows unknown to a record for property access", () => {
  const value: unknown = { kind: "x" };
  expect(isPlainObject(value)).toBe(true);
  if (!isPlainObject(value)) {
    throw new Error("guard should have narrowed");
  }
  // Compiles only because the guard narrowed `value` to Record<string, unknown>.
  // Bracket access: `noPropertyAccessFromIndexSignature` requires it for index-signature reads.
  expect(value["kind"]).toBe("x");
});
