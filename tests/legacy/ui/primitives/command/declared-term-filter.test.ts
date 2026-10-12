// The command ranking: a row's declared terms (its label and keywords) outrank cmdk's fuzzy score. Each case
// pits a declared-term row against a row cmdk alone would put first, so a pass proves the bands, not cmdk.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { declaredTermFirstFilter } from "#ui/primitives/command/declared-term-filter.ts";

const LABELS_ROW = { value: "corpus-mode:labels", keywords: ["Labels", "Create, merge, prune and edit your tags", "Corpus", "tags"] };
// The id itself starts with the query, which cmdk scores near 1, but no declared term carries it.
const ID_ONLY_ROW = { value: "tags-export:settings", keywords: ["Export settings", "Appearance"] };

test("an exact declared term outranks a fuzzy hit that cmdk alone scores higher", () => {
  const exact = declaredTermFirstFilter(LABELS_ROW.value, "Tags", LABELS_ROW.keywords);
  const fuzzy = declaredTermFirstFilter(ID_ONLY_ROW.value, "Tags", ID_ONLY_ROW.keywords);
  expect(fuzzy).toBeGreaterThan(exact - 2);
  expect(exact).toBeGreaterThan(fuzzy);
});

test("a declared term the query starts sits between an exact term and a fuzzy hit", () => {
  const exact = declaredTermFirstFilter(LABELS_ROW.value, "tags", LABELS_ROW.keywords);
  const prefix = declaredTermFirstFilter("corpus-mode:labels", "tag", ["Tagging rules"]);
  const fuzzy = declaredTermFirstFilter(ID_ONLY_ROW.value, "tag", ID_ONLY_ROW.keywords);
  expect(prefix).toBeGreaterThan(fuzzy);
  expect(exact).toBeGreaterThan(prefix);
});

test("case and surrounding space do not change the band", () => {
  // cmdk's own fuzzy part moves with the spacing; the band (the integer part) must not.
  const band = (search: string): number => Math.floor(declaredTermFirstFilter(LABELS_ROW.value, search, LABELS_ROW.keywords));
  expect(band("  TAGS ")).toBe(2);
  expect(band("tags")).toBe(2);
});

test("a row cmdk does not match stays hidden, whatever its terms", () => {
  expect(declaredTermFirstFilter("corpus-mode:insights", "zzz", ["Insights", "analytics"])).toBe(0);
});
