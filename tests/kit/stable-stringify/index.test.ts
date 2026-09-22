import { stableStringify } from "@orb/kit/stable-stringify";
import { expect, test } from "../../support/fixtures.ts";

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

test('a TOP-LEVEL undefined stringifies to the literal "null" (JSON.stringify(undefined) is really undefined at runtime)', () => {
  expect(stableStringify(undefined)).toBe("null");
});

// #1360 item 1 — this pin REPLACES an earlier one that asserted `{ a: undefined }` → `{"a":null}`. That
// spelling made an absent key and an explicit null ONE identity, and this function decides identity for
// two PERSISTED hashes (`cardContentHash`, `bookContentKey`) over card fields that are widely
// zod-`.optional()`. It was also self-inconsistent: `{text}` and `{text, groupOnly: undefined}` are the
// same logical greeting and hashed differently, because only the second carried the key.
test("an undefined PROPERTY is omitted (JSON's own rule) — absent and explicitly-null stay distinct", () => {
  expect(stableStringify({ a: undefined })).toBe("{}");
  expect(stableStringify({ a: null })).toBe('{"a":null}');
  expect(stableStringify({ a: undefined })).not.toBe(stableStringify({ a: null }));
  // The greeting shape that made this reachable: the same logical value now hashes ONE way.
  expect(stableStringify({ text: "hi", groupOnly: undefined })).toBe(stableStringify({ text: "hi" }));
});

test("an undefined ARRAY element keeps JSON's positional rule (null), so the rest are not renumbered", () => {
  expect(stableStringify([1, undefined, 3])).toBe("[1,null,3]");
});

test("nested structures serialize identically regardless of key order at every depth", () => {
  const a = { outer: { inner: { z: 1, a: [{ y: 1, x: 2 }] } } };
  const b = { outer: { inner: { a: [{ x: 2, y: 1 }], z: 1 } } };
  expect(stableStringify(a)).toBe(stableStringify(b));
});

test("numeric string keys sort lexicographically, not numerically (edge case: 10 sorts after 1 but before 2)", () => {
  const a = { "10": "ten", "2": "two", "1": "one" };
  const b = { "1": "one", "2": "two", "10": "ten" };
  expect(stableStringify(a)).toBe(stableStringify(b));
  expect(stableStringify(a)).toBe('{"1":"one","10":"ten","2":"two"}');
});
