// Unit tests for the shared embed-wire helpers — pure math + prompt templating (no IO).

import { DOC_INSTRUCTION, normalizeVector, QUERY_INSTRUCTION, toEmbedPrompt, truncateToDim } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const L2 = (v: Float32Array): number => Math.sqrt(v.reduce((a, x) => a + x * x, 0));

describe("normalizeVector", () => {
  test("returns a unit-length vector preserving direction", () => {
    const v = normalizeVector([3, 4]); // |v| = 5 → [0.6, 0.8]
    expect(L2(v)).toBeCloseTo(1, 6);
    expect(v[0]).toBeCloseTo(0.6, 6);
    expect(v[1]).toBeCloseTo(0.8, 6);
  });

  test("a zero vector normalizes to zeros (no divide-by-zero NaN)", () => {
    const v = normalizeVector([0, 0, 0]);
    expect([...v]).toEqual([0, 0, 0]);
  });

  test("emits a Float32Array of the input length", () => {
    expect(normalizeVector([1, 1, 1, 1])).toHaveLength(4);
  });
});

describe("truncateToDim", () => {
  test("keeps the leading coords when the vector is longer than dim", () => {
    expect(truncateToDim([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });

  test("returns a copy unchanged when already ≤ dim (no expansion)", () => {
    const out = truncateToDim([1, 2], 4);
    expect(out).toEqual([1, 2]);
  });

  test("MRL round-trip: truncate then normalize yields a unit vector of the requested dim", () => {
    const v = normalizeVector(truncateToDim([1, 2, 3, 4], 2));
    expect(v).toHaveLength(2);
    expect(L2(v)).toBeCloseTo(1, 6);
  });
});

describe("toEmbedPrompt", () => {
  test("wraps text + instruction in the Qwen3-VL ChatML conversation (system→user→generation prompt)", () => {
    const prompt = toEmbedPrompt("the cat sat", "Represent this.");
    expect(prompt).toContain("<|im_start|>system\nRepresent this.<|im_end|>");
    expect(prompt).toContain("<|im_start|>user\nthe cat sat<|im_end|>");
    expect(prompt.endsWith("<|im_start|>assistant\n")).toBe(true);
  });

  test("the doc and query instructions are distinct (asymmetric retrieval)", () => {
    expect(DOC_INSTRUCTION).not.toBe(QUERY_INSTRUCTION);
    expect(QUERY_INSTRUCTION.toLowerCase()).toContain("retrieve");
  });
});
