// The scoring head of a sentence-transformers CrossEncoder whose ONNX export stops at the encoder's hidden states:
// CLS pooling → Dense (+ activation) → LayerNorm → Dense(1), read from the repo's module directories. The modules
// are a few hundred KB of f32, so plain arithmetic here costs nothing next to the encoder pass.

import { z } from "zod";
import { ProviderError } from "#src/contract/errors.ts";

/** Reads one file of the model repo (`<module>/<name>`), from the local cache or the Hub. */
type RepoFileReader = (file: string) => Promise<Uint8Array>;

interface DenseLayer {
  readonly weight: Float32Array;
  readonly bias: Float32Array | undefined;
  readonly inDim: number;
  readonly outDim: number;
  readonly activation: (x: number) => number;
}

// @orb-waive no-inline-package-interface(StHead): baselined when the gate landed; burn-down item 952.
export interface StHead {
  /** The hidden size the head reads: the encoder's `hidden_size` must equal it. */
  readonly inputDim: number;
  readonly dense: DenseLayer;
  readonly normWeight: Float32Array;
  readonly normBias: Float32Array;
  readonly score: DenseLayer;
}

const SAFETENSORS_HEADER_BYTES = 8;
const F32_BYTES = 4;
// sentence-transformers builds its LayerNorm module as torch.nn.LayerNorm(dimension), so the eps is torch's default.
const LAYER_NORM_EPS = 1e-5;
const HALF = 0.5;
// Hidden states are [rows, sequence, hidden].
const HIDDEN_RANK = 3;
// Abramowitz & Stegun 7.1.26: |error| < 1.5e-7, far below the encoder's own quantization noise.
const ERF_P = 0.327_591_1;
const ERF_A1 = 0.254_829_592;
const ERF_A2 = -0.284_496_736;
const ERF_A3 = 1.421_413_741;
const ERF_A4 = -1.453_152_027;
const ERF_A5 = 1.061_405_429;
const ERF_COEFFICIENTS = [ERF_A1, ERF_A2, ERF_A3, ERF_A4, ERF_A5] as const;

function erf(x: number): number {
  const t = 1 / (1 + ERF_P * Math.abs(x));
  const poly = ERF_COEFFICIENTS.reduceRight((acc, a) => acc * t + a, 0) * t;
  return Math.sign(x) * (1 - poly * Math.exp(-x * x));
}

/** The activations a sentence-transformers Dense module names, by its torch class path. */
const ACTIVATIONS: Readonly<Record<string, (x: number) => number>> = {
  "torch.nn.modules.activation.GELU": (x) => HALF * x * (1 + erf(x / Math.SQRT2)),
  "torch.nn.modules.linear.Identity": (x) => x,
};

function headError(message: string): ProviderError {
  return new ProviderError({ kind: "server", retryable: false, message: `local-light reranker head: ${message}` });
}

const tensorMetadataSchema = z.object({
  dtype: z.literal("F32"),
  shape: z.array(z.int().nonnegative()),
  data_offsets: z.tuple([z.int().nonnegative(), z.int().nonnegative()]),
});
const safetensorsHeaderSchema = z.record(z.string(), z.unknown());
const denseConfigSchema = z
  .object({ in_features: z.int().positive(), out_features: z.int().positive(), activation_function: z.string() })
  .describe("integer in_features and out_features and a string activation_function");
const poolingConfigSchema = z.object({ pooling_mode: z.string() });

function parseSafetensors(bytes: Uint8Array): ReadonlyMap<string, Float32Array> {
  if (bytes.byteLength < SAFETENSORS_HEADER_BYTES) {
    throw headError("safetensors header is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = Number(view.getBigUint64(0, true));
  const base = SAFETENSORS_HEADER_BYTES + headerLength;
  if (!Number.isSafeInteger(base) || base > bytes.byteLength) {
    throw headError("safetensors header is truncated");
  }
  const parsedHeader = safetensorsHeaderSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes.subarray(SAFETENSORS_HEADER_BYTES, base))));
  if (!parsedHeader.success) {
    throw headError("safetensors header is not an object");
  }
  const header = parsedHeader.data;
  const tensors = new Map<string, Float32Array>();
  for (const [name, raw] of Object.entries(header)) {
    if (name === "__metadata__") {
      continue;
    }
    const parsed = tensorMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      throw headError(`tensor "${name}" has malformed metadata; only F32 heads are supported`);
    }
    const {
      shape,
      data_offsets: [start, end],
    } = parsed.data;
    const elements = shape.reduce((count, dimension) => count * dimension, 1);
    if (end < start || end > bytes.byteLength - base || start % F32_BYTES !== 0 || end % F32_BYTES !== 0 || (end - start) / F32_BYTES !== elements) {
      throw headError(`tensor "${name}" offsets do not match its shape or data`);
    }
    // Node Buffer.slice aliases its pool; this copy owns an aligned buffer for the tensor.
    const copy = new Uint8Array(bytes.subarray(base + start, base + end));
    tensors.set(name, new Float32Array(copy.buffer));
  }
  return tensors;
}

async function readJson<T>(read: RepoFileReader, file: string, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(await read(file))));
  if (!parsed.success) {
    throw headError(`${file} is malformed; expected ${schema.description ?? "valid fields"}`);
  }
  return parsed.data;
}

function tensor(tensors: ReadonlyMap<string, Float32Array>, name: string, module: string): Float32Array {
  const value = tensors.get(name);
  if (value === undefined) {
    throw headError(`${module} has no "${name}" tensor`);
  }
  return value;
}

async function readDense(read: RepoFileReader, module: string): Promise<DenseLayer> {
  const [config, weights] = await Promise.all([readJson(read, `${module}/config.json`, denseConfigSchema), read(`${module}/model.safetensors`)]);
  const activation = Object.hasOwn(ACTIVATIONS, config["activation_function"]) ? ACTIVATIONS[config["activation_function"]] : undefined;
  if (activation === undefined) {
    throw headError(`${module} uses the unsupported activation ${config["activation_function"]}`);
  }
  const inDim = config["in_features"];
  const outDim = config["out_features"];
  const tensors = parseSafetensors(weights);
  const weight = tensor(tensors, "linear.weight", module);
  const bias = tensors.get("linear.bias");
  if (weight.length !== inDim * outDim || (bias !== undefined && bias.length !== outDim)) {
    throw headError(`${module} weights do not match its ${String(inDim)}→${String(outDim)} config`);
  }
  return { weight, bias, inDim, outDim, activation };
}

/** Load the fixed CrossEncoder head layout (`1_Pooling`, `2_Dense`, `3_LayerNorm`, `4_Dense`). Anything it cannot
 *  reproduce exactly (another pooling, an unknown activation, mismatched shapes, more than one score) is refused. */
export async function loadStHead(read: RepoFileReader): Promise<StHead> {
  const pooling = await readJson(read, "1_Pooling/config.json", poolingConfigSchema);
  if (pooling["pooling_mode"] !== "cls") {
    throw headError(`pooling mode ${pooling["pooling_mode"]} is unsupported; only cls is`);
  }
  const [dense, norm, score] = await Promise.all([readDense(read, "2_Dense"), read("3_LayerNorm/model.safetensors"), readDense(read, "4_Dense")]);
  const normTensors = parseSafetensors(norm);
  const normWeight = tensor(normTensors, "norm.weight", "3_LayerNorm");
  const normBias = tensor(normTensors, "norm.bias", "3_LayerNorm");
  if (normWeight.length !== dense.outDim || normBias.length !== dense.outDim) {
    throw headError(`3_LayerNorm has ${String(normWeight.length)} weights for a ${String(dense.outDim)}-wide 2_Dense output`);
  }
  if (score.inDim !== dense.outDim || score.outDim !== 1) {
    throw headError(`4_Dense maps ${String(score.inDim)}→${String(score.outDim)}; it must map ${String(dense.outDim)}→1`);
  }
  return { inputDim: dense.inDim, dense, normWeight, normBias, score };
}

function applyDense(layer: DenseLayer, input: Float32Array): Float32Array {
  const { inDim } = layer;
  const out = new Float32Array(layer.outDim);
  for (let o = 0; o < layer.outDim; o += 1) {
    let sum = layer.bias?.[o] ?? 0;
    for (let i = 0; i < inDim; i += 1) {
      sum += (layer.weight[o * inDim + i] ?? 0) * (input[i] ?? 0);
    }
    out[o] = layer.activation(sum);
  }
  return out;
}

function layerNorm(x: Float32Array, weight: Float32Array, bias: Float32Array): Float32Array {
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length;
  const inv = 1 / Math.sqrt(variance + LAYER_NORM_EPS);
  return x.map((v, i) => (v - mean) * inv * (weight[i] ?? 1) + (bias[i] ?? 0));
}

/** One score per row of a `[rows, seq, dim]` hidden-state tensor, from each row's first (CLS) token. */
export function scoreHiddenStates(head: StHead, hidden: Float32Array, dims: readonly number[]): number[] {
  const [rows = 0, seq = 0, dim = 0] = dims;
  if (dims.length !== HIDDEN_RANK || dim !== head.inputDim || hidden.length !== rows * seq * dim) {
    throw headError(`hidden states shaped [${dims.join(", ")}] do not feed a ${String(head.inputDim)}-wide head`);
  }
  return Array.from({ length: rows }, (_, row) => {
    const cls = hidden.subarray(row * seq * dim, row * seq * dim + dim);
    const normed = layerNorm(applyDense(head.dense, cls), head.normWeight, head.normBias);
    return applyDense(head.score, normed)[0] ?? 0;
  });
}
