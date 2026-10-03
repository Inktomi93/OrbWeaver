// backends/local-light/model-cache — the rerank SERVING paths over a stub transformers.js (no weights): every pair the
// model receives fits the served window in the tokenizer's own tokens, two servings of one model id never share a
// session, a session whose outputs do not match its serving reads as failed, and a dynamically quantized serving
// scores each pair alone, and a damaged cached head repairs itself. The stub tokenizer counts one token per UTF-16 unit
// (so emoji and CJK cost what a byte-level vocabulary charges), maps "§" to an unknown token the way WordPiece does an
// out-of-vocabulary character, and throws on an empty decode as the lib does.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { RerankOnnx } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import { afterAll } from "vitest";
import type { ModelCacheConfig } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { createModelCache, rerankBatches } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";

type Lib = Awaited<ReturnType<NonNullable<ModelCacheConfig["__loadTransformersForTest"]>>>;

const MODEL = modelIdSchema.parse("orb-test/reranker");
const CLS = 1;
const SEP = 2;
const PAD = 0;
const UNK = 100;
const UNK_TEXT = "[UNK]";
const OOV = "§";
const CHAR_ID_OFFSET = 10;
const HIDDEN = 3;
const CACHE_ROOT = mkdtempSync(join(tmpdir(), "orb-rerank-serving-"));

afterAll(() => {
  rmSync(CACHE_ROOT, { force: true, recursive: true });
});
const noop = (): void => undefined;
const silentLog = { debug: noop, info: noop, warn: noop, error: noop };

class StubTensor {
  readonly data: Float32Array;
  readonly dims: number[];
  constructor(data: Float32Array, dims: number[]) {
    this.data = data;
    this.dims = dims;
  }
}

function encodeText(text: string): number[] {
  const ids: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith(UNK_TEXT, i)) {
      ids.push(UNK);
      i += UNK_TEXT.length - 1;
    } else {
      ids.push(text[i] === OOV ? UNK : CHAR_ID_OFFSET + text.charCodeAt(i));
    }
  }
  return ids;
}

function decodeIds(ids: number[], opts: { skip_special_tokens: boolean }): string {
  if (ids.length === 0) {
    throw new Error("decode of an empty id list");
  }
  const unknown = opts.skip_special_tokens ? "" : UNK_TEXT;
  return ids.map((id) => (id === UNK ? unknown : String.fromCharCode(id - CHAR_ID_OFFSET))).join("");
}

interface TokenizerCall {
  readonly ids: readonly number[][];
  readonly maxLength: number | undefined;
}

function stubTokenizer(calls: TokenizerCall[]): unknown {
  const encode = (text: string, opts: { text_pair?: string | null; add_special_tokens?: boolean } = {}): number[] => {
    const special = opts.add_special_tokens !== false;
    const pair = opts.text_pair;
    const first = special ? [CLS, ...encodeText(text), SEP] : encodeText(text);
    return pair === undefined || pair === null ? first : [...first, ...encodeText(pair), ...(special ? [SEP] : [])];
  };
  const call = (queries: string[], opts: { text_pair: string[]; max_length?: number }): Record<string, unknown> => {
    if (queries.some((q) => q.includes("\u0000"))) {
      throw new Error("the tokenizer rejected its input");
    }
    const max = opts.max_length ?? Number.POSITIVE_INFINITY;
    const ids = queries.map((q, i) => encode(q, { text_pair: opts.text_pair[i] ?? "" }).slice(0, max));
    calls.push({ ids, maxLength: opts.max_length });
    const width = Math.max(...ids.map((row) => row.length));
    return { input_ids: ids.map((row) => [...row, ...new Array<number>(width - row.length).fill(PAD)]) };
  };
  return Object.assign(call, {
    encode,
    decode: decodeIds,
    model_max_length: 8000,
  });
}

interface Hub {
  readonly online: boolean;
  readonly cacheDir: string | null;
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly fetched: string[];
}

function safetensors(tensors: Record<string, readonly number[]>): Uint8Array {
  let offset = 0;
  const header: Record<string, { dtype: string; shape: number[]; data_offsets: [number, number] }> = {};
  for (const [name, values] of Object.entries(tensors)) {
    header[name] = { dtype: "F32", shape: [values.length], data_offsets: [offset, offset + values.length * Float32Array.BYTES_PER_ELEMENT] };
    offset += values.length * Float32Array.BYTES_PER_ELEMENT;
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const lengthBytes = 8;
  const out = new Uint8Array(lengthBytes + json.length + offset);
  new DataView(out.buffer).setBigUint64(0, BigInt(json.length), true);
  out.set(json, lengthBytes);
  out.set(new Uint8Array(new Float32Array(Object.values(tensors).flat()).buffer), lengthBytes + json.length);
  return out;
}

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

/** A CrossEncoder head over a 3-wide encoder, as the hub serves its module files. */
const HEAD_FILES: Readonly<Record<string, Uint8Array>> = {
  "1_Pooling/config.json": json({ pooling_mode: "cls" }),
  "2_Dense/config.json": json({ in_features: HIDDEN, out_features: HIDDEN, activation_function: "torch.nn.modules.activation.GELU" }),
  "2_Dense/model.safetensors": safetensors({ "linear.weight": [0.5, -1, 0.25, 1.5, 0, -0.5, -0.75, 2, 1] }),
  "3_LayerNorm/model.safetensors": safetensors({ "norm.weight": [1, 0.5, 2], "norm.bias": [0.1, -0.2, 0] }),
  "4_Dense/config.json": json({ in_features: HIDDEN, out_features: 1, activation_function: "torch.nn.modules.linear.Identity" }),
  "4_Dense/model.safetensors": safetensors({ "linear.weight": [0.3, -0.6, 0.9], "linear.bias": [0.05] }),
};

const NO_HUB: Hub = { online: false, cacheDir: null, files: {}, fetched: [] };

const ST_HEAD: RerankOnnx = { head: "sentence-transformers", dtype: "fp32" };

interface StubLib {
  readonly lib: Lib;
  readonly calls: TokenizerCall[];
  readonly loads: { readonly kind: string; readonly opts: Record<string, unknown> }[];
}

/** `logits` scores each row by its first document token unless `noLogits`; the file name shifts the score so two
 *  servings of one id are told apart. */
function stubLib(behaviour: { noLogits?: boolean; hub?: Hub } = {}): StubLib {
  const calls: TokenizerCall[] = [];
  const loads: StubLib["loads"] = [];
  const encoder = Object.assign(
    (inputs: { input_ids: number[][] }): Promise<Record<string, unknown>> => {
      const rows = inputs.input_ids.length;
      const seq = Math.max(0, ...inputs.input_ids.map((row) => row.length));
      const data = Float32Array.from({ length: rows * seq * HIDDEN }, (_, i) => ((i % HIDDEN) + 1) / HIDDEN);
      return Promise.resolve({ last_hidden_state: new StubTensor(data, [rows, seq, HIDDEN]) });
    },
    { dispose: (): Promise<void> => Promise.resolve(), config: { hidden_size: HIDDEN } },
  );
  const model = (opts: Record<string, unknown>): unknown =>
    Object.assign(
      (inputs: { input_ids: number[][] }): Promise<Record<string, unknown>> => {
        if (behaviour.noLogits === true) {
          return Promise.resolve({});
        }
        const offset = opts["model_file_name"] === "model_b" ? 1000 : 0;
        const rows = inputs.input_ids.map((row) => offset + row.length);
        return Promise.resolve({ logits: new StubTensor(Float32Array.from(rows), [rows.length, 1]) });
      },
      { dispose: (): Promise<void> => Promise.resolve(), config: { hidden_size: 4 } },
    );
  const hub: Hub = behaviour.hub ?? NO_HUB;
  const lib = {
    env: {
      allowRemoteModels: hub.online,
      allowLocalModels: !hub.online,
      cacheDir: hub.cacheDir,
      remoteHost: "https://hub.test/",
      remotePathTemplate: "{model}/resolve/{revision}/",
      fetch: (url: string): Promise<Response> => {
        const file = url.split("/resolve/main/")[1] ?? "";
        hub.fetched.push(file);
        const bytes = hub.files[file];
        return Promise.resolve(bytes === undefined ? new Response(null, { status: 404 }) : new Response(bytes));
      },
    },
    AutoModel: { from_pretrained: (): Promise<unknown> => Promise.resolve(encoder) },
    Tensor: StubTensor,
    AutoTokenizer: { from_pretrained: (): Promise<unknown> => Promise.resolve(stubTokenizer(calls)) },
    AutoModelForSequenceClassification: {
      from_pretrained: (_id: string, opts: Record<string, unknown>): Promise<unknown> => {
        loads.push({ kind: "sequence-classification", opts });
        return Promise.resolve(model(opts));
      },
    },
  };
  // @orb-waive no-test-fabrication(unknown): the stub implements only the members the rerank serving path reads (env, Tensor, AutoTokenizer, AutoModel, AutoModelForSequenceClassification). Ends when the cache's library seam is narrowed to those members.
  return { lib: lib as unknown as Lib, calls, loads };
}

function cacheOver(stub: StubLib): ReturnType<typeof createModelCache> {
  return createModelCache({
    device: "cpu",
    log: silentLog,
    detach: (_n, fn) => void fn().catch(noop),
    __loadTransformersForTest: () => Promise.resolve(stub.lib),
  });
}

// The verifier's inputs: each one undercounts badly under a character estimate.
const HOSTILE = {
  digits: ["9 8 7 6 5 4 3 2 1 0 ".repeat(400), "0 1 2 3 4 5 6 7 8 9 ".repeat(1000)],
  csv: ["What did she promise?", "a,1,b,2,c,3,".repeat(3000)],
  emojiZwj: ["q", "👩‍👩‍👧‍👦".repeat(800)],
  cjk: ["火星は何色ですか", "火星は赤い惑星として知られている。".repeat(500)],
  hugeQuery: ["x ".repeat(100_000), "Mars is red."],
} as const;

test("every pair the model receives fits the served window in the tokenizer's tokens, and the document survives a huge query", async () => {
  const stub = stubLib();
  const cache = cacheOver(stub);
  const window = 512;
  for (const [query, doc] of Object.values(HOSTILE)) {
    await cache.scorePairs(MODEL, query, [doc, "short"], { maxInputTokens: window, onnx: undefined });
  }
  const rows = stub.calls.flatMap((call) => call.ids);
  expect(rows).toHaveLength(Object.keys(HOSTILE).length * 2);
  for (const row of rows) {
    expect(row.length).toBeLessThanOrEqual(window);
    // The document segment is never cut away: a [SEP] closes the query and document text follows it.
    expect(row.indexOf(SEP)).toBeLessThan(row.length - 1);
  }
  expect(stub.calls.every((call) => call.maxLength === window)).toBe(true);
});

test("two servings of one model id load two sessions and never answer for each other", async () => {
  const stub = stubLib();
  const cache = cacheOver(stub);
  const a: RerankOnnx = { head: "sequence-classification", dtype: "fp32", files: { [process.arch]: "model_a" } };
  const b: RerankOnnx = { head: "sequence-classification", dtype: "fp32", files: { [process.arch]: "model_b" } };
  const [first] = await cache.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: a });
  const [second] = await cache.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: b });
  const [again] = await cache.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: a });
  expect(stub.loads.map((load) => load.opts["model_file_name"])).toEqual(["model_a", "model_b"]);
  expect(second).toBe((first ?? 0) + 1000);
  expect(again).toBe(first);
});

test("a session whose outputs do not match its serving reads as failed, so availability stops reporting it healthy", async () => {
  const cache = cacheOver(stubLib({ noLogits: true }));
  expect(cache.loadFailed(MODEL)).toBe(false);
  await expect(cache.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: undefined })).rejects.toThrow('no "logits" output tensor');
  expect(cache.loadFailed(MODEL)).toBe(true);
});

test("a serving with no onnx block loads the fp32 export exactly as before servings existed", async () => {
  const stub = stubLib();
  await cacheOver(stub).scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: undefined });
  expect(stub.loads).toHaveLength(1);
  expect(stub.loads[0]?.opts).toMatchObject({ dtype: "fp32" });
  expect(stub.loads[0]?.opts).not.toHaveProperty("model_file_name");
});

// Dynamic quantization takes its activation scales from the whole batch, so a batched pair scored differently from
// the same pair alone (7.37 against 6.15 on the 32m).
test("a dynamically quantized serving scores every pair in its own forward pass", async () => {
  expect(rerankBatches([10, 20, 30], true)).toEqual([[0], [1], [2]]);
  const stub = stubLib();
  const onnx: RerankOnnx = { head: "sequence-classification", dtype: "fp32", dynamicQuantized: true };
  await cacheOver(stub).scorePairs(MODEL, "q", ["a", "bb", "ccc"], { maxInputTokens: 64, onnx });
  expect(stub.calls.map((call) => call.ids.length)).toEqual([1, 1, 1]);
});

// WordPiece maps an out-of-vocabulary character to [UNK]. Cutting by decoding with special tokens skipped deleted every
// one of them, so a cut pair came back shorter than its window (423 of 512 on MiniLM over Japanese text).
test("a cut pair keeps its unknown tokens and fills the window, exactly as the tokenizer's own truncation would", async () => {
  const stub = stubLib();
  const window = 64;
  const doc = `a${OOV}b${OOV}`.repeat(200);
  await cacheOver(stub).scorePairs(MODEL, "q", [doc], { maxInputTokens: window, onnx: undefined });
  const [row = []] = stub.calls.flatMap((call) => call.ids);
  const truncated = [CLS, ...encodeText("q"), SEP, ...encodeText(doc)].slice(0, window - 1);
  expect(row).toHaveLength(window);
  expect(row.filter((id) => id === UNK)).toHaveLength(truncated.filter((id) => id === UNK).length);
});

// A declared window of 1 to 4 left the query a budget of zero, and the lib's decode of an empty id list threw on every
// rerank. The resolver now floors the window; the worker must still never throw on a tiny one.
test("a degenerate window still scores, and a tokenizer failure surfaces as a typed provider error", async () => {
  const cache = cacheOver(stubLib());
  for (const window of [1, 2, 3, 4]) {
    await expect(cache.scorePairs(MODEL, "hello there", ["doc", "doc2"], { maxInputTokens: window, onnx: undefined })).resolves.toHaveLength(2);
  }
  await expect(cache.scorePairs(MODEL, "bad\u0000query", ["doc"], { maxInputTokens: 64, onnx: undefined })).rejects.toMatchObject({
    kind: "server",
    retryable: false,
  });
});

// The head files are fetched outside the lib's own cache. A truncated cached file used to fail every later load.
test("a cached head file that no longer parses is fetched again once, and the reranker scores", async () => {
  const hub: Hub = { online: true, cacheDir: join(CACHE_ROOT, "repair"), files: HEAD_FILES, fetched: [] };
  const [first] = await cacheOver(stubLib({ hub })).scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: ST_HEAD });
  expect(Number.isFinite(first)).toBe(true);
  const cachedDense = join(hub.cacheDir ?? "", MODEL, "2_Dense/model.safetensors");
  writeFileSync(cachedDense, readFileSync(cachedDense).subarray(0, 12));
  hub.fetched.length = 0;

  const repaired = cacheOver(stubLib({ hub }));
  const [second] = await repaired.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: ST_HEAD });

  expect(second).toBeCloseTo(first ?? Number.NaN, 6);
  expect(hub.fetched).toContain("2_Dense/model.safetensors");
  expect(repaired.loadFailed(MODEL)).toBe(false);
  expect(readFileSync(cachedDense)).toEqual(Buffer.from(HEAD_FILES["2_Dense/model.safetensors"] ?? new Uint8Array()));
});

test("offline, a damaged cached head fails the load by name instead of serving it", async () => {
  const online: Hub = { online: true, cacheDir: join(CACHE_ROOT, "offline"), files: HEAD_FILES, fetched: [] };
  await cacheOver(stubLib({ hub: online })).scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: ST_HEAD });
  const cachedDense = join(online.cacheDir ?? "", MODEL, "2_Dense/model.safetensors");
  writeFileSync(cachedDense, readFileSync(cachedDense).subarray(0, 12));

  const offline = cacheOver(stubLib({ hub: { ...online, online: false, fetched: [] } }));
  await expect(offline.scorePairs(MODEL, "q", ["d"], { maxInputTokens: 64, onnx: ST_HEAD })).rejects.toThrow();
  expect(offline.loadFailed(MODEL)).toBe(true);
});
