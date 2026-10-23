import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { groupIdenticalArt } from "#client/features/discovery/lib/corpus-duplicate-groups.ts";

test("exact-art components retain each member identity and first name through transitive grouping", ({ ids }) => {
  const a = mintTypeId(ID_PREFIX.character, ids.next);
  const b = mintTypeId(ID_PREFIX.character, ids.next);
  const c = mintTypeId(ID_PREFIX.character, ids.next);
  const d = mintTypeId(ID_PREFIX.character, ids.next);
  const e = mintTypeId(ID_PREFIX.character, ids.next);
  const similar = { characterIdA: c, nameA: "Shared", characterIdB: d, nameB: "Delta", similarity: 0.9994 };
  const twoMembers = { characterIdA: d, nameA: "Delta", characterIdB: e, nameB: "Echo", similarity: 1 };
  const pairs = [
    { characterIdA: c, nameA: "Shared", characterIdB: b, nameB: "Shared", similarity: 1 },
    { characterIdA: a, nameA: "Alpha", characterIdB: b, nameB: "Later name", similarity: 0.9995 },
    similar,
    twoMembers,
  ];

  const result = groupIdenticalArt(pairs);
  expect(result).toEqual({
    cliques: [
      {
        id: a,
        members: [
          { id: c, name: "Shared" },
          { id: b, name: "Shared" },
          { id: a, name: "Alpha" },
        ],
      },
    ],
    pairs: [similar, twoMembers],
  });
  expect(result.pairs[0]).toBe(similar);
  expect(result.pairs[1]).toBe(twoMembers);
  expect(groupIdenticalArt(pairs.toReversed()).cliques.map((clique) => clique.id)).toEqual([a]);
});

test("similar-only links never extend an exact-art component and empty input has no findings", ({ ids }) => {
  const a = mintTypeId(ID_PREFIX.character, ids.next);
  const b = mintTypeId(ID_PREFIX.character, ids.next);
  const c = mintTypeId(ID_PREFIX.character, ids.next);
  const pairs = [
    { characterIdA: a, nameA: "Alpha", characterIdB: b, nameB: "Beta", similarity: 1 },
    { characterIdA: b, nameA: "Beta", characterIdB: c, nameB: "Gamma", similarity: 0.9994 },
  ];
  expect(groupIdenticalArt(pairs)).toEqual({ cliques: [], pairs });
  expect(groupIdenticalArt([])).toEqual({ cliques: [], pairs: [] });
});
