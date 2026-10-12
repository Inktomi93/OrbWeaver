import type { PortableImageryCall } from "@orb/contracts/imagery";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";

export function makeImageryCall(): PortableImageryCall {
  return {
    execution: {
      sourceCallId: mintTypeId(ID_PREFIX.imageryCall),
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
      createdAt: 1_750_000_000_000,
    },
    images: [
      { sourceGenerationId: mintTypeId(ID_PREFIX.imageryGeneration), assetId: mintTypeId(ID_PREFIX.asset) },
      { sourceGenerationId: mintTypeId(ID_PREFIX.imageryGeneration), assetId: mintTypeId(ID_PREFIX.asset) },
    ],
  };
}
