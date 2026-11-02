// The resolved capability parser includes every canonical model kind without a cycle through the barrel.

// Stored-blob reads here keep zod strip mode (Spine-Config "Degrading is read-only"); tRPC inputs and outputs parse its `strictTwin` (`@orb/kit/zod-schema`).
import { z } from "zod";
import type { ModelKind } from "../kinds.ts";
import { modelKindSchema } from "../kinds.ts";
import { embeddingCapabilitySchema } from "./embedding.ts";
import { generationCapabilitySchema } from "./generation.ts";
import { rerankCapabilitySchema } from "./rerank.ts";

const capabilitySchemas = {
  generation: z.object({ kind: z.literal(modelKindSchema.enum.generation), generation: generationCapabilitySchema }).strip(),
  embedding: z.object({ kind: z.literal(modelKindSchema.enum.embedding), embedding: embeddingCapabilitySchema }).strip(),
  rerank: z.object({ kind: z.literal(modelKindSchema.enum.rerank), rerank: rerankCapabilitySchema }).strip(),
} satisfies { readonly [Kind in ModelKind]: z.ZodType<{ readonly kind: Kind }> };
const firstKind = modelKindSchema.enum.generation;
const remainingKinds = modelKindSchema.options.filter((kind) => kind !== firstKind);
export const capabilitySchema = z.discriminatedUnion("kind", [capabilitySchemas[firstKind], ...remainingKinds.map((kind) => capabilitySchemas[kind])]);
export type Capability = z.infer<typeof capabilitySchema>;
