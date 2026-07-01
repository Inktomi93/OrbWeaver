import { stripUndefined } from "@orb/kit/objects";
import { expect, test } from "../../support/fixtures";

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
