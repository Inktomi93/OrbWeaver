// The RERANK capability — a cross-encoder's window and modalities. `maxInputTokens` bounds the query+doc
// pair the #173 client-side clamp fits (rerank is scoring-only, nothing persisted, so clamping is
// legitimate); `input ∋ image` admits the multimodal data-URI body.

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";

export const rerankCapabilitySchema = z.object({
  maxInputTokens: z.number().int().positive(),
  input: z.array(modalitySchema),
  instructionAware: z.boolean(),
  windowEstimated: z.boolean().optional(),
});
export type RerankCapability = z.infer<typeof rerankCapabilitySchema>;

export const RERANK_FLOOR: RerankCapability = {
  maxInputTokens: 512,
  input: ["text"],
  instructionAware: false,
  windowEstimated: true,
};
