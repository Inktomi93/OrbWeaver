// @subject packages/contracts/src/embeddings/index.ts
import { imageCaptionMetaSchema } from "@orb/contracts/embeddings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("stored image metadata retains future residue through parse and JSON roundtrip without relaxing known facets", () => {
  const stored = {
    model: "vision-model",
    artStyle: "anime",
    tags: ["portrait", "forest", "knight"],
    futureFacet: ["unrecognized-value"],
    vendorAnalysis: { confidence: 0.8, revision: 2 },
  };
  const parsed = imageCaptionMetaSchema.parse(stored);
  expect(parsed).toEqual(stored);
  expect(imageCaptionMetaSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(stored);
  expect(imageCaptionMetaSchema.parse({ model: stored.model })).toEqual({ model: stored.model });
  expect(imageCaptionMetaSchema.safeParse({ ...stored, artStyle: "unsupported-style" }).success).toBe(false);
});
