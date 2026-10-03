// backends/local-light/model-cache — the rerank SERVING paths over a stub transformers.js (no weights): every pair the
// model receives fits the served window in the tokenizer's own tokens, two servings of one model id never share a
// session, a session whose outputs do not match its serving reads as failed, and a dynamically quantized serving
// scores each pair alone. The stub tokenizer counts one token per UTF-16 unit, so emoji and CJK cost what a byte-level
// vocabulary charges and a character estimate undercounts.

import process from "node:process";
import type { RerankOnnx } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import type { ModelCacheConfig } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { createModelCache, rerankBatches } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";

type Lib = Awaited<ReturnType<NonNullable<ModelCacheConfig["__loadTransformersForTest"]>>>;

const MODEL = modelIdSchema.parse("orb-test/reranker");
const CLS = 1;
const SEP = 2;
const PAD = 0;
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

const encodeText = (text: string): number[] => Array.from({ length: text.length }, (_, i) => 10 + text.charCodeAt(i));

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
    const max = opts.max_length ?? Number.POSITIVE_INFINITY;
    const ids = queries.map((q, i) => encode(q, { text_pair: opts.text_pair[i] ?? "" }).slice(0, max));
    calls.push({ ids, maxLength: opts.max_length });
    const width = Math.max(...ids.map((row) => row.length));
    return { input_ids: ids.map((row) => [...row, ...new Array<number>(width - row.length).fill(PAD)]) };
  };
  return Object.assign(call, {
    encode,
    decode: (ids: number[]): string => String.fromCharCode(...ids.map((id) => id - 10)),
    model_max_length: 8000,
  });
}

interface StubLib {
  readonly lib: Lib;
  readonly calls: TokenizerCall[];
  readonly loads: { readonly kind: string; readonly opts: Record<string, unknown> }[];
}

/** `logits` scores each row by its first document token unless `noLogits`; the file name shifts the score so two
 *  servings of one id are told apart. */
function stubLib(behaviour: { noLogits?: boolean } = {}): StubLib {
  const calls: TokenizerCall[] = [];
  const loads: StubLib["loads"] = [];
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
  const lib = {
    env: { allowRemoteModels: false, allowLocalModels: true, cacheDir: null },
    Tensor: StubTensor,
    AutoTokenizer: { from_pretrained: (): Promise<unknown> => Promise.resolve(stubTokenizer(calls)) },
    AutoModelForSequenceClassification: {
      from_pretrained: (_id: string, opts: Record<string, unknown>): Promise<unknown> => {
        loads.push({ kind: "sequence-classification", opts });
        return Promise.resolve(model(opts));
      },
    },
  };
  // @orb-waive no-test-fabrication(unknown): the stub implements only the members the rerank serving path reads (env, Tensor, AutoTokenizer, AutoModelForSequenceClassification). Ends when the cache's library seam is narrowed to those members.
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
