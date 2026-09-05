// Unit tests for the shared embed-wire helpers — pure math + prompt templating (no IO).

import { ProviderError } from "@orb/server/infra/providers";
import { DOC_INSTRUCTION, fitToDim, normalizeVector, QUERY_INSTRUCTION, toEmbedPrompt } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const L2 = (v: Float32Array): number => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
/** The caller coordinates a refusal carries — the surface's own operator-facing prefix. */
const PREFIX = "vllm embed (Qwen/Qwen3-VL-Embedding)";

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

// #1635 — ONE RULE for the width that reaches the store, and its two halves are NOT symmetric.
// A LONGER-than-requested vector is legitimate MRL: slicing the leading `dim` coords is exactly what the
// server's own `dimensions:` truncation does, so it is a deliberate transform, not a fault. A SHORTER one
// is a malformed RESPONSE that nothing can honestly recover — padding would invent coordinates, and
// accepting it stores a vector of a different width, i.e. of a different SPACE, undetectably. The old
// `truncateToDim` treated `< dim` as a silent no-op, which is how a short vllm vector reached the store
// un-refused while the OpenRouter decoder refused the identical shape one backend over.
//
// The prior ruling SURVIVES — its INPUT changed: we still never EXPAND. That was what the old "no
// expansion" pin was really protecting, and it is re-spelled below with an EQUAL-length vector, which is
// the case that was actually legitimate all along.
describe("fitToDim", () => {
  test("keeps the leading coords when the vector is longer than dim (MRL truncation, deliberate)", () => {
    expect(fitToDim([1, 2, 3, 4], 2, PREFIX)).toEqual([1, 2]);
  });

  test("returns a copy unchanged at exactly dim (no expansion, and no needless slice)", () => {
    const out = fitToDim([1, 2, 3, 4], 4, PREFIX);
    expect(out).toEqual([1, 2, 3, 4]);
  });

  test("REFUSES a vector SHORTER than dim, classified, naming expected and actual", () => {
    const err = attempt(() => fitToDim([1, 2], 4, PREFIX));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toMatch(/expected 4.*got 2/su);
    expect((err as ProviderError).message).toContain(PREFIX);
  });

  test("MRL round-trip: fit then normalize yields a unit vector of the requested dim", () => {
    const v = normalizeVector(fitToDim([1, 2, 3, 4], 2, PREFIX));
    expect(v).toHaveLength(2);
    expect(L2(v)).toBeCloseTo(1, 6);
  });
});

/** Run `fn` and hand back what it threw (or `null`) — the thrown value's typed fields are the assertion,
 *  and `expect().toThrow` cannot reach them. */
function attempt(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

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
