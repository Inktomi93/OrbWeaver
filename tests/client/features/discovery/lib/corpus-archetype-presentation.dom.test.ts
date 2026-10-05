import type { CorpusDestination } from "@orb/client/lib";
import type { EmbedGenerationId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { resolveCorpusArchetypeNames } from "../../../../../packages/client/src/features/discovery/lib/corpus-archetype-presentation.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type Cluster = Extract<CorpusDestination, { kind: "cluster" }>["cluster"];
function cluster(name: string, tags: string[]): Cluster {
  return {
    baseLabel: "mixed",
    label: "Mixed (legacy ordinal)",
    genre: null,
    tone: null,
    topTags: tags,
    model: "encoder",
    generationId: castId<EmbedGenerationId>("a".repeat(64)),
    fingerprint: "b".repeat(64),
    passId: "c".repeat(64),
    size: 1,
    members: [{ characterId: mintTypeId(ID_PREFIX.character), name, avatarHash: null }],
  };
}

test("shared naming uses distinguishing generated facets before representative names", () => {
  const groups = [cluster("Aria", ["rogue"]), cluster("Bolt", ["mage"])];
  expect(resolveCorpusArchetypeNames(groups)).toEqual(["Mixed · rogue", "Mixed · mage"]);
  expect(resolveCorpusArchetypeNames(groups.toReversed())).toEqual(["Mixed · mage", "Mixed · rogue"]);
});

test("identical facets use representative names, then an honest local ordinal", () => {
  expect(resolveCorpusArchetypeNames([cluster("Aria", ["rogue"]), cluster("Bolt", ["rogue"])])).toEqual(["Mixed · Aria", "Mixed · Bolt"]);
  expect(resolveCorpusArchetypeNames([cluster("Aria", ["rogue"]), cluster("Aria", ["rogue"])])).toEqual(["Mixed (1 of 2)", "Mixed (2 of 2)"]);
});

test("visual names use portrait facets and representative names without card narrative facets", () => {
  const visual = (name: string, genre: string): Cluster => ({
    ...cluster(name, []),
    baseLabel: "painted",
    analysedMembers: 1,
    artStyle: "painted",
    palette: "blue",
    mood: "quiet",
    genre,
    tone: genre,
  });
  const groups = [visual("Aria", "fantasy"), visual("Bolt", "romance")];
  expect(resolveCorpusArchetypeNames(groups)).toEqual(["Painted · Aria", "Painted · Bolt"]);
});

test("unanalysed portrait families lead with bounded member names, never a repeated readiness prefix", () => {
  const group = {
    ...cluster("Aria", []),
    baseLabel: "unanalysed portraits",
    label: "unanalysed portraits",
    artStyle: null,
    mood: null,
    palette: null,
    analysedMembers: 0,
    size: 3,
    members: ["Aria", "Bolt", "Cass"].map((name) => ({ characterId: mintTypeId(ID_PREFIX.character), name, avatarHash: null })),
  };
  expect(resolveCorpusArchetypeNames([group])).toEqual(["Aria · Bolt +1 more"]);
});
