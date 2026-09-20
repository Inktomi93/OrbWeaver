// contracts/inference/capability/embedding — the admission facts for a vector model. `dims` + `dtype` are
// what the space tag is derived from, so they are the fields a regression must not be able to soften: `dims`
// is a POSITIVE INTEGER (a 0 or a float would tag a space nothing can be stored into), `dtype` is either
// absent or a non-empty string (an empty dtype would produce the tag `model@` and split one space in two),
// and `output` is the literal `["vector"]` tuple — an embedder that claims to output text is a mis-synthesis
// the resolver must refuse rather than route a chat turn to.

import { EMBEDDING_FLOOR, embeddingCapabilitySchema } from "@orb/contracts/inference";
import { expect, test } from "../../../support/fixtures.ts";

test("the floor parses and is the conservative one — text-only, no MRL, window estimated", () => {
  expect(embeddingCapabilitySchema.parse(EMBEDDING_FLOOR)).toEqual(EMBEDDING_FLOOR);
  expect(EMBEDDING_FLOOR).toMatchObject({ input: ["text"], mrl: false, instructionAware: false, windowEstimated: true });
});

test("`dims` must be a positive integer — the space tag's other half", () => {
  for (const dims of [0, -1, 1024.5]) {
    expect(embeddingCapabilitySchema.safeParse({ ...EMBEDDING_FLOOR, dims }).success, `dims=${String(dims)} must be refused`).toBe(false);
  }
  expect(embeddingCapabilitySchema.parse({ ...EMBEDDING_FLOOR, dims: 2048 }).dims).toBe(2048);
});

test("`output` is the literal vector tuple — an embedder cannot claim to emit text", () => {
  expect(embeddingCapabilitySchema.safeParse({ ...EMBEDDING_FLOOR, output: ["text"] }).success).toBe(false);
  expect(embeddingCapabilitySchema.safeParse({ ...EMBEDDING_FLOOR, output: ["vector", "text"] }).success).toBe(false);
});

test("`dtype` is absent or non-empty — an empty one would tag the space `model@`", () => {
  expect(embeddingCapabilitySchema.parse(EMBEDDING_FLOOR).dtype).toBeUndefined();
  expect(embeddingCapabilitySchema.parse({ ...EMBEDDING_FLOOR, dtype: "q8" }).dtype).toBe("q8");
  expect(embeddingCapabilitySchema.safeParse({ ...EMBEDDING_FLOOR, dtype: "" }).success).toBe(false);
});

test("a joint-space encoder declares `image` input; the prompt scaffold is the closed `chatml` vocabulary", () => {
  const joint = embeddingCapabilitySchema.parse({ ...EMBEDDING_FLOOR, input: ["text", "image"], promptScaffold: "chatml" });
  expect(joint.input).toEqual(["text", "image"]);
  expect(joint.promptScaffold).toBe("chatml");
  expect(embeddingCapabilitySchema.safeParse({ ...EMBEDDING_FLOOR, promptScaffold: "alpaca" }).success).toBe(false);
});
