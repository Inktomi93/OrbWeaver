// backends/local-light/tasks — the pure task transforms over a FAKE model cache (the `deps.localLight.cache`
// seam; no ONNX loads): empties → `null` at their index, MRL truncation + re-L2, a request for MORE dims
// than the model emits is refused (never padded), the space tag rides as `result.model`, rerank preserves
// caller ids and sorts by score, the multimodal PAIR kind is refused.

import { EMBEDDING_FLOOR, LOCAL_TEXT_ENCODING, RERANK_FLOOR } from "@orb/contracts/inference";
import { createLocalLightEmbed, createLocalLightImageEmbed, createLocalLightRerank } from "../../../../packages/inference/src/backends/local-light/tasks.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeModelCache, fakeResolved } from "../../_support.ts";

const MODEL = "jinaai/jina-clip-v2";
const tag = (id: string): string => `${id}@q8`;

function embedConn(): ReturnType<typeof fakeResolved<"embed">> {
  return fakeResolved({
    task: "embed",
    providerId: "local-light",
    model: MODEL,
    capability: {
      kind: "embedding",
      embedding: { ...EMBEDDING_FLOOR, dims: 1024, mrl: true, input: ["text", "image"], localTextEncoding: LOCAL_TEXT_ENCODING },
    },
  });
}

function norm(vec: Float32Array): number {
  let sum = 0;
  for (const v of vec) {
    sum += v * v;
  }
  return Math.sqrt(sum);
}

test("embed: blank inputs are null at their index, vectors are unit-length, the space tag is the model", async () => {
  const cache = fakeModelCache();
  const embed = createLocalLightEmbed(cache, tag);
  const out = await embed({ connection: embedConn(), input: ["hello", "   ", "world"] });
  expect(out.vectors).toHaveLength(3);
  expect(out.vectors[1]).toBeNull();
  expect(out.vectors[0]?.length).toBe(1024);
  expect(norm(out.vectors[0] ?? new Float32Array())).toBeCloseTo(1, 5);
  expect(out.model).toBe(tag(MODEL));
  // The blank never reached the model.
  expect(cache.calls).toEqual([{ method: "embedTexts", repo: MODEL, count: 2 }]);
});

test("embed: MRL truncation re-normalizes; a wider request than the model emits is refused", async () => {
  const embed = createLocalLightEmbed(fakeModelCache(), tag);
  const truncated = await embed({ connection: embedConn(), input: "hello", dimensions: 256 });
  expect(truncated.vectors[0]?.length).toBe(256);
  expect(norm(truncated.vectors[0] ?? new Float32Array())).toBeCloseTo(1, 5);
  await expect(embed({ connection: embedConn(), input: "hello", dimensions: 4096 })).rejects.toBeInstanceOf(ProviderError);
  await expect(embed({ connection: embedConn(), input: "hello", dimensions: 4096 })).rejects.toMatchObject({ kind: "invalid" });
});

test("embed: an aborted signal is refused at the task boundary", async () => {
  const embed = createLocalLightEmbed(fakeModelCache(), tag);
  const controller = new AbortController();
  controller.abort();
  await expect(embed({ connection: embedConn(), input: "hello", signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
});

test("embed: an abort while the model is still loading rejects at once, and the load settles unread", async () => {
  // The load cannot be interrupted, so the request stops waiting on it. Without that, an aborted workload sits
  // in the load and the shutdown join waits for the whole load.
  const load = Promise.withResolvers<Float32Array[]>();
  const cache = { ...fakeModelCache(), embedTexts: (): Promise<Float32Array[]> => load.promise };
  const embed = createLocalLightEmbed(cache, tag);
  const controller = new AbortController();

  const pending = embed({ connection: embedConn(), input: "hello", signal: controller.signal });
  controller.abort();

  await expect(pending).rejects.toMatchObject({ kind: "aborted" });
  load.resolve([new Float32Array(1024)]);
  await expect(load.promise).resolves.toHaveLength(1);
});

test("rerank: caller ids preserved, sorted by score desc, topN applied, text-only query required", async () => {
  const conn = fakeResolved({
    task: "rerank",
    providerId: "local-light",
    model: "Xenova/ms-marco-MiniLM-L-6-v2",
    capability: { kind: "rerank", rerank: RERANK_FLOOR },
  });
  const rerank = createLocalLightRerank(fakeModelCache());
  const out = await rerank({
    connection: conn,
    query: "q",
    documents: [
      { id: "short", text: "ab" },
      { id: "blank", text: " " },
      { id: "long", text: "abcdef" },
    ],
  });
  // The fake scores by text length; the blank document never reaches the model.
  expect(out.hits.map((h) => h.id)).toEqual(["long", "short"]);
  const capped = await rerank({
    connection: conn,
    query: "q",
    documents: [
      { id: "a", text: "aa" },
      { id: "b", text: "bbbb" },
    ],
    topN: 1,
  });
  expect(capped.hits.map((h) => h.id)).toEqual(["b"]);
  await expect(rerank({ connection: conn, query: { image: "data:image/png;base64,AA==" }, documents: [{ id: "a", text: "x" }] })).rejects.toMatchObject({
    kind: "invalid",
  });
});

// The window cut happens in the worker, in the model's own tokens; the task hands it the capability's window and
// serving, and only bounds a huge input so the tokenizer never encodes it whole.
test("rerank: hands the worker the capability window and serving, and pre-trims only what the window could never hold", async () => {
  const seen: { query: string; documents: readonly string[]; serving: unknown }[] = [];
  const cache = {
    ...fakeModelCache(),
    scorePairs: (_repo: string, query: string, documents: readonly string[], serving: unknown): Promise<number[]> => {
      seen.push({ query, documents, serving });
      return Promise.resolve(documents.map(() => 0));
    },
  };
  const window = 1000;
  const conn = fakeResolved({
    task: "rerank",
    providerId: "local-light",
    model: "Xenova/ms-marco-MiniLM-L-6-v2",
    capability: { kind: "rerank", rerank: { ...RERANK_FLOOR, maxInputTokens: window } },
  });
  const huge = "word ".repeat(100_000);
  const fits = "word ".repeat(window);
  await createLocalLightRerank(cache)({
    connection: conn,
    query: huge,
    documents: [
      { id: "a", text: huge },
      { id: "b", text: fits },
    ],
  });
  expect(seen).toHaveLength(1);
  expect(seen.at(0)?.serving).toEqual({ maxInputTokens: window, onnx: undefined });
  const [cut = "", whole] = seen.at(0)?.documents ?? [];
  expect(cut.length).toBeLessThan(huge.length);
  expect(seen.at(0)?.query.length).toBeLessThan(huge.length);
  // Generous: a text the window could hold in full is never cut before the real-token clamp sees it.
  expect(whole).toBe(fits);
  expect(cut.length).toBeGreaterThan(fits.length);
});

test("imageEmbed: image and text arms share the space tag; the multimodal pair is refused", async () => {
  const conn = fakeResolved({
    task: "imageEmbed",
    providerId: "local-light",
    model: MODEL,
    capability: {
      kind: "embedding",
      embedding: { ...EMBEDDING_FLOOR, dims: 1024, mrl: true, input: ["text", "image"], localTextEncoding: LOCAL_TEXT_ENCODING },
    },
  });
  const cache = fakeModelCache();
  const imageEmbed = createLocalLightImageEmbed(cache, tag);
  const images = await imageEmbed({ connection: conn, input: { kind: "image", input: [new Uint8Array([1, 2, 3]), "data:image/png;base64,AA=="] } });
  expect(images.vectors).toHaveLength(2);
  expect(images.model).toBe(tag(MODEL));
  const texts = await imageEmbed({ connection: conn, input: { kind: "text", input: ["a", ""] } });
  expect(texts.vectors[1]).toBeNull();
  await expect(
    imageEmbed({ connection: conn, input: { kind: "multimodal", input: { text: "a", image: "data:image/png;base64,AA==" } } }),
  ).rejects.toMatchObject({ kind: "invalid" });
});

test("imageEmbed: explicit pair fallback uses the same text tower and preserves batch empty slots", async () => {
  const cache = fakeModelCache();
  const imageEmbed = createLocalLightImageEmbed(cache, tag);
  const connection = fakeResolved({ task: "imageEmbed", providerId: "local-light", model: MODEL, capability: embedConn().capability });
  const pairs = [
    { text: "caption", image: new Uint8Array([1]) },
    { text: " ", image: new Uint8Array([2]) },
  ];
  const fallback = await imageEmbed({ connection, input: { kind: "multimodal", input: pairs, allowTextFallback: true } });
  const direct = await imageEmbed({ connection, input: { kind: "text", input: pairs.map((pair) => pair.text) } });
  expect(fallback).toEqual(direct);
  expect(fallback.model).toBe(tag(MODEL));
  expect(fallback.vectors[1]).toBeNull();
  expect(cache.calls).toEqual([
    { method: "embedClipTexts", repo: MODEL, count: 1 },
    { method: "embedClipTexts", repo: MODEL, count: 1 },
  ]);
  await expect(imageEmbed({ connection, input: { kind: "multimodal", input: pairs, allowTextFallback: false } })).rejects.toMatchObject({ kind: "invalid" });
});

// A declared shorter MRL width is the owner's space for text AND pictures: the image side cuts to it too, or every
// picture would be written wider than the text index it shares a space with.
test("imageEmbed: an MRL encoder declared at a shorter width embeds images and image-side text at that width", async () => {
  const conn = fakeResolved({
    task: "imageEmbed",
    providerId: "local-light",
    model: MODEL,
    capability: {
      kind: "embedding",
      embedding: { ...EMBEDDING_FLOOR, dims: 512, mrl: true, input: ["text", "image"], localTextEncoding: LOCAL_TEXT_ENCODING },
    },
  });
  const imageEmbed = createLocalLightImageEmbed(fakeModelCache(1024), tag);
  const images = await imageEmbed({ connection: conn, input: { kind: "image", input: new Uint8Array([1, 2, 3]) } });
  const texts = await imageEmbed({ connection: conn, input: { kind: "text", input: "a red square" } });
  expect(images.vectors.map((vector) => vector?.length)).toEqual([512]);
  expect(texts.vectors.map((vector) => vector?.length)).toEqual([512]);
  expect(norm(images.vectors[0] ?? new Float32Array())).toBeCloseTo(1);
});

test("embed: an MRL encoder declared at a shorter width cuts text to it even when the caller asks for no width", async () => {
  const conn = fakeResolved({
    task: "embed",
    providerId: "local-light",
    model: MODEL,
    capability: {
      kind: "embedding",
      embedding: { ...EMBEDDING_FLOOR, dims: 512, mrl: true, input: ["text", "image"], localTextEncoding: LOCAL_TEXT_ENCODING },
    },
  });
  const embed = createLocalLightEmbed(fakeModelCache(1024), tag);
  const out = await embed({ connection: conn, input: "a red square" });
  expect(out.vectors.map((vector) => vector?.length)).toEqual([512]);
});
