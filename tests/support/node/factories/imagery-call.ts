import type { PortableImageryCall } from "@orb/contracts/imagery";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { IdSource } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";

const ids = createIdSource(createSeededIds().next);

export function makeImageryCall(source: IdSource = ids): PortableImageryCall {
  return {
    execution: {
      sourceCallId: source.typeId(ID_PREFIX.imageryCall),
      mode: "free",
      prompt: "Two images of the same blue bird",
      negativePrompt: "text",
      model: modelIdSchema.parse("requested-image-model"),
      provider: providerIdSchema.parse("google"),
      costUsd: 0.125,
      usage: {
        servedModel: "served-image-model",
        tokensIn: 150,
        tokensOut: 300,
        reasoningTokens: null,
        cacheReadTokens: 40,
        cacheWriteTokens: null,
        costProvenance: "estimated",
        costDetails: { totalUsd: 0.125, pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.25 } },
        tokenDetails: { input: [{ modality: "text", tokens: 100 }], output: [{ modality: "image", tokens: 200 }] },
      },
      subjectCharacterHandle: null,
      chatId: null,
      connectionId: null,
      identityHash: null,
      edited: true,
      createdAt: FROZEN_AT_MS,
    },
    images: [
      { sourceGenerationId: source.typeId(ID_PREFIX.imageryGeneration), assetId: source.typeId(ID_PREFIX.asset) },
      { sourceGenerationId: source.typeId(ID_PREFIX.imageryGeneration), assetId: source.typeId(ID_PREFIX.asset) },
    ],
  };
}
