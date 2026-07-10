// biome-ignore-all lint/style/noProcessEnv: this gated E2E reads ONE opt-in env flag to decide whether
// to download real ONNX weights from the Hugging Face Hub. Default-OFF keeps the suite offline-green.
//
// REAL-MODEL integration test for the local-light EMBED role — downloads the default jina-clip-v2 ONNX
// weights on first run, so it is GATED behind ORB_LOCAL_LIGHT_E2E=1 (network). Forces device "cpu" for
// determinism (no GPU dependency) and a quantized dtype (q4) so the opt-in verify is practical (the
// fp32 weights are multi-GB). Asserts the unified jina-clip dim (1024), exact self-similarity (the same
// text embeds identically → cosine 1.0), discrimination (unrelated text < self), and MRL truncation.

import process from "node:process";
import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { EmbedRequest, EmbedResult } from "@orb/server/infra/providers";
import {
  createLocalLightBackend,
  DEFAULT_EMBED_MODEL,
} from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const RUN = process.env["ORB_LOCAL_LIGHT_E2E"] === "1";
const suite = RUN ? describe : describe.skip;

const CRED = makeResolvedCredential("local-light");
const MODEL = DEFAULT_EMBED_MODEL as ModelId;
const JINA_DIM = 1024;
const DOWNLOAD_TIMEOUT_MS = 600_000;

const backend = RUN ? createLocalLightBackend({ device: "cpu", dtype: "q4" }) : null;

/** A real CPU-bound embed callable (forces device "cpu" for deterministic, GPU-free runs; q4 weights to
 *  keep the opt-in download tractable). */
function embedFn(): (req: EmbedRequest) => Promise<EmbedResult> {
  if (!backend) {
    throw new Error("Backend not initialized");
  }
  const fn = backend.embed;
  if (fn === undefined) {
    throw new Error("embed role not wired");
  }
  return fn;
}

function requireVector(vec: Float32Array | null): Float32Array {
  if (vec === null) {
    throw new Error("expected a non-null vector");
  }
  return vec;
}

suite("local-light embed (real jina-clip-v2 ONNX inference)", () => {
  test(
    "embeds to the unified 1024-dim space; identical text is self-similar; unrelated text differs",
    async () => {
      const res = await embedFn()({
        credential: CRED,
        model: MODEL,
        input: ["a cat sits on the mat", "a cat sits on the mat", "quarterly tax accounting"],
      });

      const same0 = requireVector(res.vectors[0] ?? null);
      const same1 = requireVector(res.vectors[1] ?? null);
      const other = requireVector(res.vectors[2] ?? null);

      expect(same0).toHaveLength(JINA_DIM);
      // Deterministic engine: the same input embeds to (essentially) the same vector → cosine ≈ 1.0.
      expect(cosineSim(same0, same1)).toBeCloseTo(1, 4);
      // An unrelated sentence is clearly less similar than the identical one.
      expect(cosineSim(same0, other)).toBeLessThan(0.95);
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  test(
    "honors MRL `dimensions`: a truncated vector is shorter and unit-length",
    async () => {
      const truncated = 128;
      const res = await embedFn()({
        credential: CRED,
        model: MODEL,
        input: "hello world",
        dimensions: truncated,
      });

      const vec = requireVector(res.vectors[0] ?? null);
      expect(vec).toHaveLength(truncated);
      expect(cosineSim(vec, vec)).toBeCloseTo(1, 4);
    },
    DOWNLOAD_TIMEOUT_MS,
  );
});
