// The seeders' offline local-light cache. The seeded corpus is byte-stable only while the same text yields
// the same vector, and the seeded encoder and reranker rows read as running only while the fake reports
// no failed load.
import { modelIdSchema } from "@orb/contracts/inference";
import { fakeLocalLightCache } from "@orb/tooling/seed";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DIM = 8;
const MODEL = modelIdSchema.parse("jinaai/jina-clip-v2");

test("the same text embeds to the same vector and a different text does not", async () => {
  const cache = fakeLocalLightCache(DIM);
  const [first, again, other] = await cache.embedTexts(MODEL, ["a quiet harbour", "a quiet harbour", "a loud market"]);
  expect(first).toHaveLength(DIM);
  expect(again).toEqual(first);
  expect(other).not.toEqual(first);
});

test("no model ever reads as a failed load, so the seeded rows stay running", async () => {
  const cache = fakeLocalLightCache(DIM);
  await cache.preload("embed", MODEL);
  expect(cache.loadFailed(MODEL)).toBe(false);
});
