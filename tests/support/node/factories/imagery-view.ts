// Wire-output builder for the imagery provenance read (`imagery.readProvenance`): a scenario picture with no
// recorded usage. The defaults parse through the contract schema; an override is spread after the parse.

import { generationProvenanceSchema } from "@orb/contracts/imagery";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

type ProvenanceWire = NonNullable<TrpcWireOutput<"imagery.readProvenance">>;

export function makeGenerationProvenance(overrides: Partial<ProvenanceWire> = {}): ProvenanceWire {
  return {
    ...generationProvenanceSchema.parse({
      mode: "scenario",
      prompt: "a lantern-lit street",
      negativePrompt: null,
      model: "image-model",
      costUsd: null,
      usage: {
        tokensIn: null,
        tokensOut: null,
        reasoningTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        servedModel: null,
        tokenDetails: null,
        costDetails: null,
        costProvenance: null,
      },
      subjectCharacterId: null,
      edited: false,
      createdAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}
