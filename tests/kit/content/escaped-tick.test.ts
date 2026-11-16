// A backslash-escaped tick opens no code span, so nothing after it is read as code.

import { markdownCodeAfterMacros, stripStyleElements } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

test("a macro after an escaped tick is not in code", () => {
  expect(markdownCodeAfterMacros("it\\`s {{user}} and that`s")).toEqual([]);
});

test("a tick behind an escaped backslash still opens a span", () => {
  expect(markdownCodeAfterMacros("\\\\`{{user}}`")).toHaveLength(1);
});

test("a span closes at a tick behind a backslash, so a macro after it is not in code", () => {
  expect(markdownCodeAfterMacros("`a\\` {{user}} `")).toEqual([]);
});

test("a macro in a real code span is in code", () => {
  expect(markdownCodeAfterMacros("see `{{user}}` here")).toHaveLength(1);
});

test("a style element after an escaped tick is stripped", () => {
  expect(stripStyleElements("it\\`s <style>p{color:red}</style> and that`s")).toBe("it\\`s  and that`s");
});
