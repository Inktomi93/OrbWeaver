import { escapeRegExp } from "@orb/kit/strings";
import { expect, test } from "../../support/fixtures";

test("escapeRegExp prefixes each regex metacharacter with a backslash", () => {
  const metachars = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"];
  for (const ch of metachars) {
    expect(escapeRegExp(ch)).toBe(`\\${ch}`);
  }
});

test("escapeRegExp leaves plain text untouched", () => {
  expect(escapeRegExp("Alice")).toBe("Alice");
  expect(escapeRegExp("")).toBe("");
});

test("an escaped string matches its literal source inside a RegExp", () => {
  const literal = "a.b(c)*";
  const re = new RegExp(escapeRegExp(literal));
  expect(re.test(literal)).toBe(true);
  // Without escaping the metachars would make this a non-literal pattern that misses the source.
  expect(re.test("axbyc")).toBe(false);
});
