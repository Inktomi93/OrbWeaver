// The resolved capability parser includes every canonical model kind without a cycle through the barrel.

import { z } from "zod";
import type { ModelKind } from "../kinds.ts";
import { modelKindSchema } from "../kinds.ts";
import { embeddingCapabilitySchema } from "./embedding.ts";
import { generationCapabilitySchema } from "./generation.ts";
import { rerankCapabilitySchema } from "./rerank.ts";

const capabilitySchemas = {
  generation: z.object({ kind: z.literal(modelKindSchema.enum.generation), generation: generationCapabilitySchema }),
  embedding: z.object({ kind: z.literal(modelKindSchema.enum.embedding), embedding: embeddingCapabilitySchema }),
  rerank: z.object({ kind: z.literal(modelKindSchema.enum.rerank), rerank: rerankCapabilitySchema }),
} satisfies { readonly [Kind in ModelKind]: z.ZodType<{ readonly kind: Kind }> };
const firstKind = modelKindSchema.enum.generation;
const remainingKinds = modelKindSchema.options.filter((kind) => kind !== firstKind);
export const capabilitySchema = z.discriminatedUnion("kind", [capabilitySchemas[firstKind], ...remainingKinds.map((kind) => capabilitySchemas[kind])]);
export type Capability = z.infer<typeof capabilitySchema>;
