// Padding spaces inside an emphasis pair are dropped; a long run of spaces no marker touches costs its length.
// @subject packages/kit/src/fix-markdown/index.ts

import { fixMarkdown } from "@orb/kit/fix-markdown";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;

test.each([
  ["a padded italic pair", "* hello *", "*hello*"],
  ["a padded underscore pair", "_ x _", "_x_"],
  ["a padded bold pair", "** bold **", "**bold**"],
  ["unicode spaces", "* 　hi *", "*hi*"],
  ["a lone marker is prose", "a * b", "a * b"],
  ["an already tight pair", "a *b* c", "a *b* c"],
])("%s", (_name, text, fixed) => {
  expect(fixMarkdown(text, false)).toBe(fixed);
});

test("a long run of spaces inside a pair is read in linear time", () => {
  const text = `*${" ".repeat(300_000)}x ${" ".repeat(300_000)}*`;
  const started = performance.now();
  expect(fixMarkdown(text, false)).toBe("*x*");
  expect(performance.now() - started).toBeLessThan(BUDGET_MS);
});
