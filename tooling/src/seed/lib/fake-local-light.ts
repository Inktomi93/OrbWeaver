// The deterministic OFFLINE local-light model cache the seeders inject through the runtime's sanctioned
// `providerSeams.localLight.cache` seam (the same seam the compose int-tests use — inference program §11).
//
// WHY a fake instead of skipping embeddings: `embeddings.store` has no precomputed-vector path — it always
// embeds through the owner's `embed` binding, which on a fresh box is the SEEDED local-light row (§7.2).
// Injecting a scripted model cache is what lets the REAL vector write path (and the databank chunk→embed
// pipeline) run credit-free, GPU-free, download-free and byte-stable across runs. Chat turns are NOT scripted
// any more: a seeded user holds no `chat` connection, so the demo's best-effort turns log `no-connection`
// and keep the greeting transcript (the honest offline posture, never a fake wire).

import type { LocalLightModelCache } from "@orb/inference";

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_SPAN = 4294967296;
const CENTER_OFFSET = 0.5;
/** How many leading bytes seed an image's vector — enough to tell two pictures apart, cheap to hash. */
const IMAGE_SEED_BYTES = 64;

/** A stable [0,1) pseudo-random stream seeded from a string (mulberry32) — same text ⇒ same vector. */
function seededStream(text: string): () => number {
  let a = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, FNV_PRIME);
  }
  return (): number => {
    a |= 0;
    a = (a + MULBERRY_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_SPAN;
  };
}

/** A deterministic embedding for `text` of the given dim (centered so L2-normalization keeps it
 *  non-degenerate). */
export function fakeEmbedding(text: string, dim: number): number[] {
  const rand = seededStream(text);
  return Array.from({ length: dim }, () => rand() - CENTER_OFFSET);
}

function fakeVector(text: string, dim: number): Float32Array {
  return Float32Array.from(fakeEmbedding(text, dim));
}

function imageSeed(image: Uint8Array | string): string {
  return typeof image === "string" ? image : Array.from(image.subarray(0, Math.min(image.length, IMAGE_SEED_BYTES))).join(",");
}

/** A scripted in-process model cache: every slot answers deterministically from its input bytes. `preload`
 *  is a no-op (nothing to download), and the matte op refuses — no seeder cuts a background. */
export function fakeLocalLightCache(dim: number): LocalLightModelCache {
  return {
    embedTexts: (_modelId, texts) => Promise.resolve(texts.map((t) => fakeVector(t, dim))),
    embedClipTexts: (_modelId, texts) => Promise.resolve(texts.map((t) => fakeVector(t, dim))),
    embedImages: (_modelId, images) => Promise.resolve(images.map((img) => fakeVector(imageSeed(img), dim))),
    scorePairs: (_modelId, query, documents) => Promise.resolve(documents.map((doc) => seededStream(`${query}\n${doc}`)())),
    removeBackground: (_modelId, _image) => Promise.reject(new Error("seed fake local-light: no matte model offline")),
    preload: () => Promise.resolve(),
    loadFailed: () => false,
  };
}
