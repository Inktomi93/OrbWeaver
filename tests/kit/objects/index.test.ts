import { pickKeys, stripUndefined } from "@orb/kit/objects";
import { expect, test } from "../../support/fixtures";

test("pickKeys returns EXACTLY the named keys — the un-named siblings are absent, not undefined", () => {
  const result = pickKeys({ a: 1, b: 2, c: 3 }, ["a", "c"]);
  expect(result).toStrictEqual({ a: 1, c: 3 });
  expect(Object.keys(result)).toStrictEqual(["a", "c"]);
});

test("pickKeys copies a present-but-undefined/null value rather than dropping the key", () => {
  const result = pickKeys({ a: undefined, b: null, c: 1 }, ["a", "b"]);
  expect(Object.keys(result)).toStrictEqual(["a", "b"]);
  expect(result.b).toBeNull();
});

test("pickKeys with no keys is an empty object, and never aliases the source", () => {
  const source = { a: 1 };
  const result = pickKeys(source, []);
  expect(result).toStrictEqual({});
  expect(result).not.toBe(source);
});

test("stripUndefined drops undefined keys but preserves null and other falsy values", () => {
  const result = stripUndefined({ a: 1, b: undefined, c: null, d: 0, e: "", f: false });
  expect(result).toEqual({ a: 1, c: null, d: 0, e: "", f: false });
  expect("b" in result).toBe(false);
});

test("stripUndefined returns an empty object when every value is undefined", () => {
  expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
});

test("stripUndefined leaves an object with no undefined values intact", () => {
  const input = { name: "x", count: 3 };
  expect(stripUndefined(input)).toEqual(input);
});
