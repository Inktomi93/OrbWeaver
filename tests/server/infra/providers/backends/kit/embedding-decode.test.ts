// backends/kit/embedding-decode — the ONE alignment- and width-checked decoder for an OpenAI-dialect
// embeddings payload. What is load-bearing here is the two REFUSALS, not the conversion: before this module
// the two runners each carried a bare conversion, so a truncated base64 body escaped as a raw host
// `RangeError` (unclassified, indistinguishable from a bug in our own code) and a wrong-width vector went
// straight into the store, where nothing downstream can ever detect that it belongs to a different space.
// The refusals name EXPECTED and ACTUAL because a bare "invalid embedding" cannot be triaged against a
// provider. Both are `invalid`/non-retryable: the disagreement is deterministic, so a retry re-buys it.

import { Buffer } from "node:buffer";
import { ProviderError } from "@orb/server/infra/providers";
import { decodeEmbeddingVector, decodeEmbeddingVectors } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const PREFIX = "openrouter embed (qwen/qwen3-embedding)";

function base64Of(values: readonly number[]): string {
  return Buffer.from(new Float32Array(values).buffer).toString("base64");
}

describe("decodeEmbeddingVector", () => {
  test("decodes a float array and a base64 payload to the same vector", () => {
    expect([...decodeEmbeddingVector([0.5, -0.25], PREFIX)]).toEqual([0.5, -0.25]);
    expect([...decodeEmbeddingVector(base64Of([0.5, -0.25]), PREFIX)]).toEqual([0.5, -0.25]);
  });

  test("refuses a base64 payload that is not a whole number of float32s, naming the byte count", () => {
    // 9 bytes — two whole floats plus a stray, the shape a truncated stream produces. `new Float32Array` on
    // this used to throw a bare RangeError out of the provider tier.
    const err = attempt(() => decodeEmbeddingVector(Buffer.from(new Uint8Array(9)).toString("base64"), PREFIX));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toContain("9 bytes");
    expect((err as ProviderError).message).toContain(PREFIX);
  });

  test("refuses a width that contradicts the requested dimensions, naming expected and actual", () => {
    const err = attempt(() => decodeEmbeddingVector([0.1, 0.2, 0.3], PREFIX, 1024));
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toMatch(/expected 1024.*got 3/su);
  });

  test("admits any width when no dimensions were requested (a MATCH check, never a floor)", () => {
    expect(decodeEmbeddingVector([0.1, 0.2, 0.3], PREFIX).length).toBe(3);
    // And a matching width passes the check rather than merely being unchecked.
    expect(decodeEmbeddingVector([0.1, 0.2, 0.3], PREFIX, 3).length).toBe(3);
  });

  test("a zero-length payload is a legal decode, not an alignment failure (0 % 4 === 0)", () => {
    // The EMPTINESS of a response is a different fact, owned by the runner's own empty-set refusal — this
    // decoder must not collapse the two, or that refusal's message becomes unreachable.
    expect(decodeEmbeddingVector("", PREFIX).length).toBe(0);
  });
});

describe("decodeEmbeddingVectors", () => {
  test("decodes a whole batch in order, float array and base64 arms alike", () => {
    // Exactly-representable float32s on purpose: a 0.1 here would fail on the widening back to float64 and
    // say nothing at all about ORDER, which is what this test is for.
    const vectors = decodeEmbeddingVectors([[0.5, -0.25], base64Of([0.75, 1.5])], PREFIX, 2, 2);
    expect(vectors.map((v) => [...v])).toEqual([
      [0.5, -0.25],
      [0.75, 1.5],
    ]);
  });

  test("refuses a count that does not match the inputs — the positional pairing is the only thing tying vector N to input N", () => {
    const err = attempt(() => decodeEmbeddingVectors([[0.1, 0.2]], PREFIX, 3));
    expect(err).toMatchObject({ kind: "invalid", retryable: false });
    expect((err as ProviderError).message).toMatch(/expected 3.*got 1/su);
  });

  test("the count check runs BEFORE any decode (a short list is refused, never partially decoded)", () => {
    // A misaligned entry sits behind the count mismatch: the message proves which guard spoke.
    const err = attempt(() => decodeEmbeddingVectors([Buffer.from(new Uint8Array(9)).toString("base64")], PREFIX, 2));
    expect((err as ProviderError).message).toContain("count does not match");
  });
});

/** Run `fn` and hand back whatever it threw (or `null`) — `expect().toThrow` cannot assert on the thrown
 *  value's own typed fields, and those fields are the whole point of the classification. */
function attempt(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}
