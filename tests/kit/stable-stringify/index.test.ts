import { stableStringify } from "@orb/kit/stable-stringify";
import { expect, test } from "../../support/fixtures";

test("sorts object keys recursively regardless of insertion order", () => {
  const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
  const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };
  expect(stableStringify(a)).toBe(stableStringify(b));
  expect(stableStringify(a)).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
});

test("preserves array element order (arrays are not sorted)", () => {
  expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
});

test("primitives serialize like JSON.stringify", () => {
  expect(stableStringify("x")).toBe('"x"');
  expect(stableStringify(42)).toBe("42");
  expect(stableStringify(true)).toBe("true");
  expect(stableStringify(null)).toBe("null");
});

test('undefined stringifies to the literal "null" (JSON.stringify(undefined) is really undefined at runtime)', () => {
  expect(stableStringify(undefined)).toBe("null");
  expect(stableStringify({ a: undefined })).toBe('{"a":null}');
});

test("nested structures serialize identically regardless of key order at every depth", () => {
  const a = { outer: { inner: { z: 1, a: [{ y: 1, x: 2 }] } } };
  const b = { outer: { inner: { a: [{ x: 2, y: 1 }], z: 1 } } };
  expect(stableStringify(a)).toBe(stableStringify(b));
});
