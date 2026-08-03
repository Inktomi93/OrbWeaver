// The tag-library ordering axis. What is load-bearing here is NOT "sort works" — it is that the three
// modes disagree with each other on the same input (a comparator that silently fell back to `alpha` would
// pass a single-mode test), that `used` breaks its ties by NAME so the long unused tail is still scannable,
// that an unordered tag (`sortOrder: null`) lands AFTER every authored position instead of colliding at 0,
// and that the sort never mutates its input — the input is a query cache's array.

import type { SortableTag } from "@orb/client/lib";
import { sortTagsBy } from "@orb/client/lib";
import { expect, test } from "../../support/fixtures.ts";

const tag = (name: string, total: number, sortOrder: number | null): SortableTag => ({ name, sortOrder, usage: { total } });

const LIBRARY: readonly SortableTag[] = [
  tag("adventure", 7, 0),
  tag("orphan", 0, 1),
  tag("zeal", 12, 2),
  // Same usage as `orphan`, later in the alphabet — the tie-break's witness.
  tag("brine", 0, 3),
];

const names = (tags: readonly SortableTag[]): readonly string[] => tags.map((t) => t.name);

test("the three modes produce three DIFFERENT orders over one library", () => {
  expect(names(sortTagsBy(LIBRARY, "used"))).toEqual(["zeal", "adventure", "brine", "orphan"]);
  expect(names(sortTagsBy(LIBRARY, "alpha"))).toEqual(["adventure", "brine", "orphan", "zeal"]);
  expect(names(sortTagsBy(LIBRARY, "manual"))).toEqual(["adventure", "orphan", "zeal", "brine"]);
});

test("used: a usage tie resolves by name, so the unused tail stays scannable", () => {
  const tail = names(sortTagsBy(LIBRARY, "used")).slice(-2);
  expect(tail).toEqual(["brine", "orphan"]);
});

test("manual: an unordered tag sorts AFTER every authored position, not at 0", () => {
  const withNull = [tag("unplaced", 0, null), tag("first", 0, 0)];
  expect(names(sortTagsBy(withNull, "manual"))).toEqual(["first", "unplaced"]);
});

test("the input array is never mutated (it is a query cache's array)", () => {
  const source = [...LIBRARY];
  sortTagsBy(source, "alpha");
  expect(names(source)).toEqual(["adventure", "orphan", "zeal", "brine"]);
});
