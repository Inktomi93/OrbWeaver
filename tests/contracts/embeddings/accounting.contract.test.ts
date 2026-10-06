import { embeddingBatchObservationSchema } from "@orb/contracts/embeddings";
import { expect, test } from "../../support/fixtures.ts";

const OBSERVED = {
  inputCount: 2,
  inputModalities: ["text", "image"],
  servedModel: "served-model",
  usage: { promptTokens: 10, totalTokens: null },
  tokenDetails: { input: [{ modality: "image", tokens: 3 }] },
  cost: { costUsd: 0, costDetails: { totalUsd: 0 }, costProvenance: "measured" },
};

test("one paid batch preserves its physical count, modality split and measured zero", () => {
  expect(embeddingBatchObservationSchema.parse(JSON.parse(JSON.stringify(OBSERVED)))).toEqual(OBSERVED);
});

test("an observation refuses invalid counts, modalities and served-model claims", () => {
  for (const overrides of [{ inputCount: 0 }, { inputCount: 1.5 }, { inputModalities: ["unknown"] }, { servedModel: "" }]) {
    expect(embeddingBatchObservationSchema.safeParse({ ...OBSERVED, ...overrides }).success).toBe(false);
  }
});
