// contracts/inference/capability/rerank — a cross-encoder's window and modalities. `maxInputTokens` is the
// bound the client-side query+document clamp fits into, so it must be a positive integer: a 0 would clamp
// every pair to nothing and return a scored-but-empty list rather than failing. `windowEstimated` marks the
// floor's window as a GUESS, which is what lets a later measurement override it without the UI claiming a
// measured number it never had.

import { RERANK_FLOOR, rerankCapabilitySchema } from "@orb/contracts/inference";
import { expect, test } from "../../../support/fixtures.ts";

test("the floor parses and declares itself a guess", () => {
  expect(rerankCapabilitySchema.parse(RERANK_FLOOR)).toEqual(RERANK_FLOOR);
  expect(RERANK_FLOOR.windowEstimated, "nothing measured this window — the surface must be able to say so").toBe(true);
  expect(RERANK_FLOOR.input).toEqual(["text"]);
  expect(RERANK_FLOOR.instructionAware).toBe(false);
});

test("`maxInputTokens` must be a positive integer — the clamp's bound", () => {
  for (const maxInputTokens of [0, -512, 512.5]) {
    expect(rerankCapabilitySchema.safeParse({ ...RERANK_FLOOR, maxInputTokens }).success).toBe(false);
  }
  expect(rerankCapabilitySchema.parse({ ...RERANK_FLOOR, maxInputTokens: 8192 }).maxInputTokens).toBe(8192);
});

test("a multimodal reranker declares `image` input from the closed modality vocabulary", () => {
  expect(rerankCapabilitySchema.parse({ ...RERANK_FLOOR, input: ["text", "image"] }).input).toEqual(["text", "image"]);
  expect(rerankCapabilitySchema.safeParse({ ...RERANK_FLOOR, input: ["hologram"] }).success).toBe(false);
});

test("a measured window drops the estimated flag rather than keeping a stale `true`", () => {
  const measured = rerankCapabilitySchema.parse({ ...RERANK_FLOOR, maxInputTokens: 4096, windowEstimated: false });
  expect(measured.windowEstimated).toBe(false);
});
