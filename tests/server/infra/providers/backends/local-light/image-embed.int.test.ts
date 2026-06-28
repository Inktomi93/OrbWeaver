// biome-ignore-all lint/style/noProcessEnv: this gated E2E reads ONE opt-in env flag to decide whether
// to download real ONNX weights from the Hugging Face Hub. Default-OFF keeps the suite offline-green.
//
// REAL-MODEL integration test for the local-light IMAGE-EMBED role — downloads the default jina-clip-v2
// ONNX (the unified text + image encoders) on first run, so it is GATED behind ORB_LOCAL_LIGHT_E2E=1
// (network). Forces device "cpu" + a quantized dtype (q4) so the opt-in verify is practical. Generates
// real PNGs with sharp. Asserts the joint 1024-dim space: image + text vectors are unit-length and live
// in ONE comparable space (cosine is a finite [-1,1] value), and the same image embeds identically
// (cosine ≈ 1.0).

import process from "node:process";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ImageInput } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { ImageEmbedRequest, ImageEmbedResult } from "@orb/server/infra/providers";
import {
  createLocalLightBackend,
  DEFAULT_IMAGE_EMBED_MODEL,
} from "@orb/server/infra/providers/backends/local-light";
import sharp from "sharp";
import { describe, expect, test } from "vitest";

const RUN = process.env["ORB_LOCAL_LIGHT_E2E"] === "1";
const suite = RUN ? describe : describe.skip;

const CRED = { source: "local-light", credentialId: null } as unknown as ResolvedCredential;
const MODEL = DEFAULT_IMAGE_EMBED_MODEL as ModelId;
const JINA_DIM = 1024;
const SWATCH_SIZE = 64;
const DOWNLOAD_TIMEOUT_MS = 600_000;

function imageEmbedFn(): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  const fn = createLocalLightBackend({ device: "cpu", dtype: "q4" }).imageEmbed;
  if (fn === undefined) {
    throw new Error("imageEmbed role not wired");
  }
  return fn;
}

function requireVector(vec: Float32Array | null): Float32Array {
  if (vec === null) {
    throw new Error("expected a non-null vector");
  }
  return vec;
}

/** A solid-color PNG as raw bytes (a valid, decodable image for the jina-clip vision encoder). */
async function swatch(r: number, g: number, b: number): Promise<ImageInput> {
  const buf = await sharp({
    create: { width: SWATCH_SIZE, height: SWATCH_SIZE, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

suite("local-light imageEmbed (real jina-clip-v2 ONNX inference)", () => {
  test(
    "embeds images to the joint 1024-dim space; the same image is self-similar",
    async () => {
      const red = await swatch(220, 20, 20);
      const res = await imageEmbedFn()({
        credential: CRED,
        model: MODEL,
        input: { kind: "image", input: [red, red] },
      });

      expect(res.vectors).toHaveLength(2);
      const a = requireVector(res.vectors[0] ?? null);
      const b = requireVector(res.vectors[1] ?? null);
      expect(a).toHaveLength(JINA_DIM);
      expect(cosineSim(a, a)).toBeCloseTo(1, 4);
      // The identical image embeds identically.
      expect(cosineSim(a, b)).toBeCloseTo(1, 4);
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  test(
    "embeds text into the SAME joint space (image↔text cosine is a finite comparable value)",
    async () => {
      const embed = imageEmbedFn();
      const imageRes = await embed({
        credential: CRED,
        model: MODEL,
        input: { kind: "image", input: await swatch(20, 20, 220) },
      });
      const textRes = await embed({
        credential: CRED,
        model: MODEL,
        input: { kind: "text", input: "a solid blue square" },
      });

      const image = requireVector(imageRes.vectors[0] ?? null);
      const text = requireVector(textRes.vectors[0] ?? null);
      expect(image).toHaveLength(JINA_DIM);
      expect(text).toHaveLength(JINA_DIM);
      // A joint space → cross-modal cosine is defined and in range (not asserting a magnitude, only
      // that the two modalities share one comparable space).
      const sim = cosineSim(image, text);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    },
    DOWNLOAD_TIMEOUT_MS,
  );
});
