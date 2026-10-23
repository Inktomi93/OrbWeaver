import type { Capability, capabilitySchema, EmbeddingCapability, GenerationCapability, RerankCapability } from "@orb/contracts/inference";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("the public capability parser preserves each kind's exact output", () => {
  expectTypeOf<z.output<typeof capabilitySchema>>().toEqualTypeOf<Capability>();
  expectTypeOf<Extract<Capability, { kind: "generation" }>["generation"]>().toEqualTypeOf<GenerationCapability>();
  expectTypeOf<Extract<Capability, { kind: "embedding" }>["embedding"]>().toEqualTypeOf<EmbeddingCapability>();
  expectTypeOf<Extract<Capability, { kind: "rerank" }>["rerank"]>().toEqualTypeOf<RerankCapability>();
  expectTypeOf<{ kind: "embedding"; rerank: RerankCapability }>().not.toExtend<Capability>();
});
