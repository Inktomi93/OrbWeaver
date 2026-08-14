// The wave-collapse pure logic (data/collapse-filters.ts header): drop every filter another filter in
// the same wave already covers, so one invalidation wave never spends two round trips on one query.
// The wave-level consequences (what a reconnect heal actually spends, against a REAL QueryClient) are
// pinned in ./invalidation.test.ts; THIS file pins the collapse's own decision table — coverage by
// partial-prefix key, order independence, and the key-only fence (a filter carrying `exact`/`predicate`
// means more than its key says, so it never eliminates another and is never eliminated).

import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { describe } from "vitest";
import { collapseFilters } from "../../../packages/client/src/data/collapse-filters.ts";
import { expect, test } from "../../support/fixtures.ts";

const personaRoot: InvalidateQueryFilters = { queryKey: [["persona"]] };
const personaList: InvalidateQueryFilters = { queryKey: [["persona", "list"]] };
const tagRoot: InvalidateQueryFilters = { queryKey: [["tag"]] };

function keys(filters: readonly InvalidateQueryFilters[]): readonly unknown[] {
  return filters.map((filter) => filter.queryKey);
}

describe("collapseFilters — coverage by partial-prefix key", () => {
  test("an exact repeat collapses to one spend", () => {
    expect(collapseFilters([personaRoot, personaRoot])).toEqual([personaRoot]);
  });

  test("a narrower key under a broader sibling is dropped (broad first)", () => {
    expect(keys(collapseFilters([personaRoot, personaList]))).toEqual([[["persona"]]]);
  });

  test("order-independent: the broad filter arriving AFTER the narrow one still wins", () => {
    expect(keys(collapseFilters([personaList, personaRoot]))).toEqual([[["persona"]]]);
  });

  test("a root covers an input-carrying descendant key (react-query matches by partial prefix)", () => {
    const withInput: InvalidateQueryFilters = { queryKey: [["persona", "list"], { input: { limit: 50 } }] };
    expect(keys(collapseFilters([personaRoot, withInput]))).toEqual([[["persona"]]]);
  });

  test("unrelated roots are all kept — the collapse drops coverage, never breadth", () => {
    expect(keys(collapseFilters([personaRoot, tagRoot]))).toEqual([[["persona"]], [["tag"]]]);
  });

  test("an empty wave stays empty", () => {
    expect(collapseFilters([])).toEqual([]);
  });
});

describe("collapseFilters — the key-only fence", () => {
  test("a broad filter carrying `exact` never eliminates its narrower sibling", () => {
    const exactRoot: InvalidateQueryFilters = { queryKey: [["persona"]], exact: true };
    expect(collapseFilters([exactRoot, personaList])).toHaveLength(2);
  });

  test("a narrow filter carrying `predicate` is never eliminated by its root", () => {
    const guarded: InvalidateQueryFilters = { queryKey: [["persona", "list"]], predicate: () => true };
    expect(collapseFilters([personaRoot, guarded])).toHaveLength(2);
  });
});
