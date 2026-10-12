import { finiteNumberOrNull, isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

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

test("isPlainObject is true for a null-prototype object (Object.create(null))", () => {
  // typeof is "object", not null, not an array — a null-prototype object IS a plain object here
  // even though it has no Object.prototype (e.g. no .hasOwnProperty).
  expect(isPlainObject(Object.create(null))).toBe(true);
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

test("finiteNumberOrNull keeps a finite number and nulls everything else", () => {
  expect(finiteNumberOrNull(0)).toBe(0);
  expect(finiteNumberOrNull(-1.5)).toBe(-1.5);
  expect(finiteNumberOrNull(Number.NaN)).toBeNull();
  expect(finiteNumberOrNull(Number.POSITIVE_INFINITY)).toBeNull();
  expect(finiteNumberOrNull("3")).toBeNull();
  expect(finiteNumberOrNull(undefined)).toBeNull();
});
