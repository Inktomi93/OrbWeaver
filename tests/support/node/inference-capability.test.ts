// @subject tests/support/iso/inference-capability.ts

import { GENERATION_FLOOR } from "@orb/contracts/inference";
import { makeCapability, makeEmbeddingCapability, makeGenerationCapability, makeRerankCapability } from "@orb/testkit/iso/inference-capability.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("mutating one generation fixture cannot rewrite the next fixture or the production floor", () => {
  const first = makeGenerationCapability();
  first.output.maxTokens.max += 1;
  first.input.push("image");
  const next = makeCapability();
  expect(next).toEqual({ kind: "generation", generation: GENERATION_FLOOR });
  expect(first).not.toEqual(GENERATION_FLOOR);
});

test("overrides cannot bypass the actual capability constraints", () => {
  expect(() => makeGenerationCapability({ sampling: { samplerOrder: ["temperature", "temperature"] } })).toThrow();
  expect(() => makeEmbeddingCapability({ dims: 0 })).toThrow();
  expect(() => makeRerankCapability({ maxInputTokens: 0 })).toThrow();
});
