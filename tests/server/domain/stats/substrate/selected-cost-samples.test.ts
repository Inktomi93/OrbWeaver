import type { CharacterId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { costOfSamples, createSelectedCostAccumulator, modelCostKey } from "../../../../../packages/server/src/domain/stats/substrate/selected-cost-samples.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";

test("selected cost keeps unknown and explicit zero distinct and groups only the matching voice/model/provider", ({ ids }) => {
  const owner = castId<UserId>(ids.next("user"));
  const a = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const b = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const model = testModelId("selected-model");
  const openai = testProviderId("openai");
  const google = testProviderId("google");
  const samples = createSelectedCostAccumulator(owner);
  samples.append([
    { id: castId<MessageVariantId>(ids.next(ID_PREFIX.messageVariant)), characterId: a, model, provider: openai, costUsd: null, metadata: null },
    { id: castId<MessageVariantId>(ids.next(ID_PREFIX.messageVariant)), characterId: b, model, provider: openai, costUsd: 0, metadata: null },
    { id: castId<MessageVariantId>(ids.next(ID_PREFIX.messageVariant)), characterId: b, model, provider: google, costUsd: 0.25, metadata: null },
  ]);
  expect(costOfSamples(samples.maps.characters.get(a))).toBeNull();
  expect(costOfSamples(samples.maps.characters.get(b))).toBe(0.25);
  expect(costOfSamples(samples.maps.models.get(modelCostKey(b, model, openai)))).toBe(0);
  expect(costOfSamples(samples.maps.models.get(modelCostKey(b, model, google)))).toBe(0.25);
  expect(costOfSamples(undefined)).toBeNull();
});

test("incompatible monetary bases never become an invoice total", () => {
  expect(costOfSamples({ costUsd: 0.375, costSamples: 2, notionalCostSamples: 1 })).toBeNull();
  expect(costOfSamples({ costUsd: 0.375, costSamples: 2, notionalCostSamples: 2 })).toBe(0.375);
  expect(costOfSamples({ costUsd: 0, costSamples: 1, notionalCostSamples: 0 })).toBe(0);
});
