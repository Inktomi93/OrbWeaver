import type { Capability, EmbeddingCapability, GenerationCapability, RerankCapability } from "@orb/contracts/inference";
import {
  capabilitySchema,
  EMBEDDING_FLOOR,
  embeddingCapabilitySchema,
  GENERATION_FLOOR,
  generationCapabilitySchema,
  RERANK_FLOOR,
  rerankCapabilitySchema,
} from "@orb/contracts/inference";

/** Builds a generation descriptor from the canonical fail-closed floor. */
export function makeGenerationCapability(overrides: Partial<GenerationCapability> = {}): GenerationCapability {
  return generationCapabilitySchema.parse({ ...GENERATION_FLOOR, ...overrides });
}

/** Builds an embedding descriptor from the canonical kind floor. */
export function makeEmbeddingCapability(overrides: Partial<EmbeddingCapability> = {}): EmbeddingCapability {
  return embeddingCapabilitySchema.parse({ ...EMBEDDING_FLOOR, ...overrides });
}

/** Builds a rerank descriptor from the canonical unmeasured floor. */
export function makeRerankCapability(overrides: Partial<RerankCapability> = {}): RerankCapability {
  return rerankCapabilitySchema.parse({ ...RERANK_FLOOR, ...overrides });
}

/** Wraps the existing generation builder in the owner-validated capability envelope. */
export function makeCapability(generation: GenerationCapability = makeGenerationCapability()): Capability {
  return capabilitySchema.parse({ kind: "generation", generation });
}
