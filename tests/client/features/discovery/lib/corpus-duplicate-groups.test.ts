// Unit: the identical-art equivalence-class collapse (features/discovery/lib/corpus-duplicate-groups).
// Pure, no DOM. This is the module standing between ONE finding ("twelve cards share a placeholder
// portrait") and the sixty-six pairwise rows the Similarity tab used to render it as (#564), so what is
// asserted here is the CLAIM the grouping makes about the data: which pairs collapse, which must not, and
// that a collapsed pair never also appears as its own row.

import { groupIdenticalArt } from "../../../../../packages/client/src/features/discovery/lib/corpus-duplicate-groups.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function pair(a: string, b: string, similarity: number): { characterIdA: string; nameA: string; characterIdB: string; nameB: string; similarity: number } {
  return { characterIdA: a, nameA: a.toUpperCase(), characterIdB: b, nameB: b.toUpperCase(), similarity };
}

test("a fully-connected identical clique collapses to ONE group and leaves no pair behind", () => {
  // The audited shape in miniature: four cards sharing one portrait = C(4,2) = 6 rows for one fact.
  const pairs = [pair("a", "b", 1), pair("a", "c", 1), pair("a", "d", 1), pair("b", "c", 1), pair("b", "d", 1), pair("c", "d", 1)];
  const { cliques, pairs: leftover } = groupIdenticalArt(pairs);
  expect(cliques).toHaveLength(1);
  expect([...(cliques[0]?.memberIds ?? [])].sort()).toEqual(["a", "b", "c", "d"]);
  // Every one of the six rows is inside the group, so none survives as its own row.
  expect(leftover).toHaveLength(0);
});

test("names ride the members in the order the ranked list introduced them", () => {
  const { cliques } = groupIdenticalArt([pair("b", "c", 1), pair("a", "b", 1)]);
  expect(cliques[0]?.names).toEqual(["B", "C", "A"]);
});

test("SUB-identical pairs never chain — the collapse is only sound where the relation is transitive", () => {
  // a~b at 0.9 and b~c at 0.9 says nothing about a~c, so calling {a,b,c} one group would be a claim the
  // near-duplicate pass never made. Both rows survive as rows.
  const { cliques, pairs: leftover } = groupIdenticalArt([pair("a", "b", 0.9), pair("b", "c", 0.9)]);
  expect(cliques).toHaveLength(0);
  expect(leftover).toHaveLength(2);
});

test("a two-card identical pair stays a PAIR — there is nothing to collapse and a row is already minimal", () => {
  const { cliques, pairs: leftover } = groupIdenticalArt([pair("a", "b", 1)]);
  expect(cliques).toHaveLength(0);
  expect(leftover.map((p) => p.characterIdA)).toEqual(["a"]);
});

test("two independent cliques stay two findings", () => {
  const pairs = [pair("a", "b", 1), pair("b", "c", 1), pair("a", "c", 1), pair("x", "y", 1), pair("y", "z", 1), pair("x", "z", 1)];
  const { cliques } = groupIdenticalArt(pairs);
  expect(cliques).toHaveLength(2);
  expect(cliques.map((clique) => clique.id)).toEqual(["a", "x"]);
});

test("a clique and an unrelated near-pair coexist: the group collapses, the pair keeps its row", () => {
  const pairs = [pair("a", "b", 1), pair("b", "c", 1), pair("a", "c", 1), pair("m", "n", 0.88)];
  const { cliques, pairs: leftover } = groupIdenticalArt(pairs);
  expect(cliques).toHaveLength(1);
  expect(leftover.map((p) => p.characterIdA)).toEqual(["m"]);
});

test("a float cosine of ~1 is identical — the wire never sends an exact 1 for a computed match", () => {
  const { cliques } = groupIdenticalArt([pair("a", "b", 0.999_99), pair("b", "c", 0.9998), pair("a", "c", 1)]);
  expect(cliques).toHaveLength(1);
});
