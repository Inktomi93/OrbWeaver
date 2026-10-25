// fuzzySearch keys its result cache by value, so the hook needs no manual memo: an inline options literal
// that is fresh every render must still return the one cached array for the same items and query.
import { expect, test } from "@orb/testkit/node";
import { fuzzySearch } from "@orb/ui/fuzzy-search";

const ITEMS = [
  { id: "1", name: "Alpha model", body: "fast" },
  { id: "2", name: "Beta model", body: "slow" },
  { id: "3", name: "Gamma", body: "alpha twin" },
] as const;

test("equal-valued options on the same items return the cached result array", () => {
  const first = fuzzySearch(ITEMS, "alpha", { fields: ["name", "body"] });
  const second = fuzzySearch(ITEMS, "alpha", { fields: ["name", "body"] });
  expect(second).toBe(first);
  expect(first.map(({ id }) => id).toSorted()).toEqual(["1", "3"]);
});

test("a different option value is a different result, not a stale hit", () => {
  const wide = fuzzySearch(ITEMS, "alpha", { fields: ["name", "body"] });
  const narrow = fuzzySearch(ITEMS, "alpha", { fields: ["name", "body"], limit: 1 });
  const nameOnly = fuzzySearch(ITEMS, "alpha", { fields: ["name", "body"], searchFields: ["name"] });
  expect(narrow).toHaveLength(1);
  expect(nameOnly.map(({ id }) => id)).toEqual(["1"]);
  expect(wide).toHaveLength(2);
});

test("a new items array does not reuse another array's results", () => {
  const first = fuzzySearch(ITEMS, "beta", { fields: ["name"] });
  const next = fuzzySearch([...ITEMS], "beta", { fields: ["name"] });
  expect(next).not.toBe(first);
  expect(next).toEqual(first);
});

test("an empty query returns the items untouched", () => {
  expect(fuzzySearch(ITEMS, "  ", { fields: ["name"] })).toBe(ITEMS);
});
