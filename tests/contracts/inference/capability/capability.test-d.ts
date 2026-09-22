import type { Capability, EmbeddingCapability, GenerationCapability, KIND_DEFS, RerankCapability } from "@orb/contracts/inference";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("each model kind keeps its own capability output and floor type", () => {
  expectTypeOf<z.output<(typeof KIND_DEFS)["generation"]["capabilitySchema"]>>().toEqualTypeOf<GenerationCapability>();
  expectTypeOf<z.output<(typeof KIND_DEFS)["embedding"]["capabilitySchema"]>>().toEqualTypeOf<EmbeddingCapability>();
  expectTypeOf<z.output<(typeof KIND_DEFS)["rerank"]["capabilitySchema"]>>().toEqualTypeOf<RerankCapability>();

  expectTypeOf<(typeof KIND_DEFS)["generation"]["floor"]>().toEqualTypeOf<Extract<Capability, { readonly kind: "generation" }>>();
  expectTypeOf<(typeof KIND_DEFS)["embedding"]["floor"]>().toEqualTypeOf<Extract<Capability, { readonly kind: "embedding" }>>();
  expectTypeOf<(typeof KIND_DEFS)["rerank"]["floor"]>().toEqualTypeOf<Extract<Capability, { readonly kind: "rerank" }>>();
});
