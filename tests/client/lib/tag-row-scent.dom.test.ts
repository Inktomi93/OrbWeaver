// Entry: `tagRowScent`, the Labels finder row's subtitle. Layer: client lib (node, dom). Red: the stamp following the
// suggestion clause, where a narrow list clips it on exactly the rows that carry a suggestion.
import { tagRowScent } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node";

const STAMP = "created yesterday";
const NO_USE = { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 };
const IN_USE = { ...NO_USE, characters: 3, total: 3 };

test("the stamp sits before a suggestion clause, so the clause is the part a narrow list clips", () => {
  const scent = tagRowScent({ usage: IN_USE, pendingSuggestions: 2 }, STAMP);
  expect(scent.indexOf(STAMP)).toBeGreaterThan(0);
  expect(scent.indexOf(STAMP)).toBeLessThan(scent.indexOf("2"));
  expect(scent.endsWith(STAMP)).toBe(false);
});

test("a tag with no uses and no suggestions, and one with only suggestions, each keep their stamp once", () => {
  for (const tag of [
    { usage: NO_USE, pendingSuggestions: 0 },
    { usage: NO_USE, pendingSuggestions: 1 },
  ]) {
    expect(tagRowScent(tag, STAMP).split(STAMP)).toHaveLength(2);
  }
});

test("with no suggestion the stamp closes the line", () => {
  expect(tagRowScent({ usage: IN_USE, pendingSuggestions: 0 }, STAMP).endsWith(STAMP)).toBe(true);
});
