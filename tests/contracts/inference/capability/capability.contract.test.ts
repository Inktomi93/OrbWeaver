// contracts/inference/capability/capability — the ONE discriminated `Capability` a resolved connection
// carries. The discriminator is what every consumer narrows on, so the pins are: an arm only parses with ITS
// OWN payload (a `kind: "generation"` object carrying an `embedding` block is not a capability, it is two
// halves of a mis-synthesis), an unknown kind is refused outright rather than parsed as a partial, and the
// extra keys of a WRONG arm are stripped rather than carried into the resolved value where a downstream
// `capability.embedding` read would find them.

import { capabilitySchema, EMBEDDING_FLOOR, GENERATION_FLOOR, RERANK_FLOOR } from "@orb/contracts/inference";
import { expect, test } from "../../../support/fixtures.ts";

test("each arm parses with its own floor", () => {
  expect(capabilitySchema.parse({ kind: "generation", generation: GENERATION_FLOOR })).toMatchObject({ kind: "generation" });
  expect(capabilitySchema.parse({ kind: "embedding", embedding: EMBEDDING_FLOOR })).toMatchObject({ kind: "embedding" });
  expect(capabilitySchema.parse({ kind: "rerank", rerank: RERANK_FLOOR })).toMatchObject({ kind: "rerank" });
});

test("an arm without its own payload is REFUSED", () => {
  expect(capabilitySchema.safeParse({ kind: "generation" }).success).toBe(false);
  expect(capabilitySchema.safeParse({ kind: "embedding", generation: GENERATION_FLOOR }).success).toBe(false);
  expect(capabilitySchema.safeParse({ kind: "rerank", embedding: EMBEDDING_FLOOR }).success).toBe(false);
});

test("an unknown kind is refused — never parsed as a partial capability", () => {
  expect(capabilitySchema.safeParse({ kind: "image", generation: GENERATION_FLOOR }).success).toBe(false);
  expect(capabilitySchema.safeParse({ generation: GENERATION_FLOOR }).success).toBe(false);
});

test("a foreign payload on the RIGHT arm is stripped, not carried into the resolved value", () => {
  const parsed = capabilitySchema.parse({ kind: "embedding", embedding: EMBEDDING_FLOOR, generation: GENERATION_FLOOR });
  expect(parsed).not.toHaveProperty("generation");
});
