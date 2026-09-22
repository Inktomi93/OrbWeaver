// The ONE discriminated `Capability` a resolved connection carries + `KIND_DEFS`, the kind → schema/floor
// map that makes a new kind a `tsc`-forced sweep. A leaf beside the per-kind files so `reads.ts` can import
// the union without a cycle through the barrel.

import { z } from "zod";
import type { ModelKind } from "../kinds.ts";
import { EMBEDDING_FLOOR, embeddingCapabilitySchema } from "./embedding.ts";
import { GENERATION_FLOOR, generationCapabilitySchema } from "./generation.ts";
import { RERANK_FLOOR, rerankCapabilitySchema } from "./rerank.ts";

export const capabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("generation"), generation: generationCapabilitySchema }),
  z.object({ kind: z.literal("embedding"), embedding: embeddingCapabilitySchema }),
  z.object({ kind: z.literal("rerank"), rerank: rerankCapabilitySchema }),
]);
export type Capability = z.infer<typeof capabilitySchema>;

type CapabilityPayloadByKind = {
  readonly [K in ModelKind]: Extract<Capability, { readonly kind: K }> extends Readonly<Record<K, infer Payload>> ? Payload : never;
};

export interface KindDef<K extends ModelKind = ModelKind> {
  readonly capabilitySchema: z.ZodType<CapabilityPayloadByKind[K]>;
  readonly floor: Extract<Capability, { readonly kind: K }>;
}

export type KindDefs = { readonly [K in ModelKind]: KindDef<K> };

export const KIND_DEFS = {
  generation: { capabilitySchema: generationCapabilitySchema, floor: { kind: "generation", generation: GENERATION_FLOOR } },
  embedding: { capabilitySchema: embeddingCapabilitySchema, floor: { kind: "embedding", embedding: EMBEDDING_FLOOR } },
  rerank: { capabilitySchema: rerankCapabilitySchema, floor: { kind: "rerank", rerank: RERANK_FLOOR } },
} satisfies KindDefs;
