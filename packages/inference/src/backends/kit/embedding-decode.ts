// backends/kit/embedding-decode — the ONE decoder for an OpenAI-dialect embeddings payload
// (`number[]` for `encoding_format:"float"`, or a base64 string) into the `Float32Array` the vector store
// consumes, WITH the two structural checks the hand-rolled copies did not have.
//
// WHY IT IS A GUARD AND NOT JUST A CONVERSION. Both properties below were violated silently before this
// module existed (the embed and image runners each carried their own copy of the conversion):
//
//   • ALIGNMENT — `new Float32Array(buf)` THROWS a raw host `RangeError` when the byte length is not a
//     multiple of 4. A truncated or otherwise corrupt base64 body therefore escaped the provider tier as an
//     unclassified engine error: no `kind`, no `retryable`, indistinguishable from a bug in our own code,
//     and invisible to every consumer that branches on `ProviderError`.
//   • WIDTH — nothing compared the decoded vector's length against the `dimensions` the request asked for.
//     A provider that ignored MRL truncation (or answered from a different model) returned a vector of the
//     WRONG SPACE, and it went straight into storage. A vector in the wrong space is not a degraded result;
//     it is a permanently wrong neighbour set that nothing downstream can detect, because a stored vector
//     carries no evidence of what it was supposed to be.
//
// Both refuse as `ProviderError{kind:"invalid", retryable:false}` naming EXPECTED and ACTUAL. Non-retryable
// is the honest arm: the disagreement is deterministic, so a retry re-buys the identical refusal with the
// caller's money (see the `invalid` member's own doc in `contract/errors.ts`).

import type { WireEmbedding } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";

const BASE64 = "base64";
const BYTES_PER_FLOAT32 = 4;

function invalid(message: string): ProviderError {
  return new ProviderError({ kind: "invalid", retryable: false, message });
}

/**
 * Decode ONE wire embedding into a `Float32Array`, refusing a misaligned payload and a width that
 * contradicts `expectedDimensions` (omit it when the request asked for no particular width — then any
 * self-consistent width is admitted; this is a MATCH check, never a floor).
 *
 * `prefix` is the caller's operator-facing coordinates (`openrouter embed (model)`), so a refusal says which
 * role and model produced the payload without this module knowing either.
 */
export function decodeEmbeddingVector(embedding: WireEmbedding, prefix: string, expectedDimensions?: number): Float32Array<ArrayBuffer> {
  const vector = typeof embedding === "string" ? fromBase64(embedding, prefix) : new Float32Array(embedding);
  if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
    throw invalid(`${prefix}: embedding width does not match the requested dimensions — expected ${expectedDimensions}, got ${vector.length}`);
  }
  return vector;
}

/**
 * Decode a whole response's embeddings and assert the COUNT matches the inputs. Positional alignment is the
 * only thing tying vector N to input N — a short or long list silently re-pairs every vector after the gap,
 * which is the same wrong-neighbours failure as a width mismatch and just as undetectable downstream.
 */
export function decodeEmbeddingVectors(
  embeddings: readonly WireEmbedding[],
  prefix: string,
  expectedCount: number,
  expectedDimensions?: number,
): Float32Array<ArrayBuffer>[] {
  if (embeddings.length !== expectedCount) {
    throw invalid(`${prefix}: embedding count does not match the inputs — expected ${expectedCount}, got ${embeddings.length}`);
  }
  return embeddings.map((embedding) => decodeEmbeddingVector(embedding, prefix, expectedDimensions));
}

/** Base64 → an exactly-sized, 4-byte-aligned copy. The copy is NOT optional: `Buffer.from` returns a view
 *  into a POOLED ArrayBuffer at an arbitrary `byteOffset`, and a direct float32 view of a misaligned offset
 *  would RangeError even for a well-formed payload. The length check is the separate, wire-level fact. */
function fromBase64(embedding: string, prefix: string): Float32Array<ArrayBuffer> {
  const bytes = Buffer.from(embedding, BASE64);
  if (bytes.byteLength % BYTES_PER_FLOAT32 !== 0) {
    throw invalid(`${prefix}: base64 embedding is not a whole number of float32s — ${bytes.byteLength} bytes is not a multiple of ${BYTES_PER_FLOAT32}`);
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Float32Array(copy);
}
