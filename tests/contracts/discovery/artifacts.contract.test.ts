import { archetypeSchema, visualArchetypeSchema } from "@orb/contracts/discovery";
import type { EmbedGenerationId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("computed archetypes retain corpus provenance and complete members but not widened member data", () => {
  const member = { characterId: mintTypeId(ID_PREFIX.character), name: "Aria", avatarHash: null };
  const row = {
    baseLabel: "quiet",
    passId: "ab".repeat(32),
    generationId: castId<EmbedGenerationId>("cd".repeat(32)),
    fingerprint: null,
    label: "Quiet scholars",
    genre: null,
    tone: "quiet",
    size: 1,
    members: [member],
    model: "embedding-model",
  };
  const card = { ...row, topTags: ["scholar"] };
  const visual = { ...row, artStyle: "ink", palette: null, mood: null };
  expect(archetypeSchema.parse(card)).toEqual(card);
  expect(visualArchetypeSchema.parse(visual)).toEqual(visual);
  expect(archetypeSchema.safeParse({ ...card, privateOwner: "private" }).success).toBe(false);
  expect(visualArchetypeSchema.safeParse({ ...visual, members: [{ ...member, privateCard: "private" }] }).success).toBe(false);
});
