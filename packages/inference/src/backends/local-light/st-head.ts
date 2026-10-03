// The scoring head of a sentence-transformers CrossEncoder whose ONNX export stops at the encoder's hidden states:
// CLS pooling → Dense (+ activation) → LayerNorm → Dense(1), read from the repo's module directories. The modules
// are a few hundred KB of f32, so plain arithmetic here costs nothing next to the encoder pass.

import { ProviderError } from "../../contract/errors.ts";

/** Reads one file of the model repo (`<module>/<name>`), from the local cache or the Hub. */
type RepoFileReader = (file: string) => Promise<Uint8Array>;

interface DenseLayer {
  readonly weight: Float32Array;
  readonly bias: Float32Array | undefined;
  readonly outDim: number;
  readonly activation: (x: number) => number;
}

export interface StHead {
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

function parseSafetensors(bytes: Uint8Array): ReadonlyMap<string, Float32Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = Number(view.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(SAFETENSORS_HEADER_BYTES, SAFETENSORS_HEADER_BYTES + headerLength))) as Record<
    string,
    { readonly dtype?: string; readonly data_offsets?: readonly [number, number] }
  >;
  const base = SAFETENSORS_HEADER_BYTES + headerLength;
  const tensors = new Map<string, Float32Array>();
  for (const [name, meta] of Object.entries(header)) {
    if (name === "__metadata__") {
      continue;
    }
    if (meta.dtype !== "F32" || meta.data_offsets === undefined) {
      throw headError(`tensor "${name}" is ${String(meta.dtype)}; only F32 heads are supported`);
    }
    const [start, end] = meta.data_offsets;
    // A copy into a fresh buffer: aligned for Float32Array, and correct for a Node Buffer, whose `slice` is a view
    // into a shared pool rather than a copy.
    const copy = new Uint8Array(bytes.subarray(base + start, base + end));
    tensors.set(name, new Float32Array(copy.buffer, 0, (end - start) / F32_BYTES));
  }
  return tensors;
}

async function readJson(read: RepoFileReader, file: string): Promise<Record<string, unknown>> {
  return JSON.parse(new TextDecoder().decode(await read(file))) as Record<string, unknown>;
}

function tensor(tensors: ReadonlyMap<string, Float32Array>, name: string, module: string): Float32Array {
  const value = tensors.get(name);
  if (value === undefined) {
    throw headError(`${module} has no "${name}" tensor`);
  }
  return value;
}

async function readDense(read: RepoFileReader, module: string): Promise<DenseLayer> {
  const [config, weights] = await Promise.all([readJson(read, `${module}/config.json`), read(`${module}/model.safetensors`)]);
  const activation = ACTIVATIONS[String(config["activation_function"])];
  if (activation === undefined) {
    throw headError(`${module} uses the unsupported activation ${String(config["activation_function"])}`);
  }
  const tensors = parseSafetensors(weights);
  return { weight: tensor(tensors, "linear.weight", module), bias: tensors.get("linear.bias"), outDim: Number(config["out_features"]), activation };
}

/** Load the head the repo's `modules.json` chain describes. Anything but CLS pooling is refused, not approximated. */
export async function loadStHead(read: RepoFileReader): Promise<StHead> {
  const pooling = await readJson(read, "1_Pooling/config.json");
  if (pooling["pooling_mode"] !== "cls") {
    throw headError(`pooling mode ${String(pooling["pooling_mode"])} is unsupported; only cls is`);
  }
  const [dense, norm, score] = await Promise.all([readDense(read, "2_Dense"), read("3_LayerNorm/model.safetensors"), readDense(read, "4_Dense")]);
  const normTensors = parseSafetensors(norm);
  return { dense, normWeight: tensor(normTensors, "norm.weight", "3_LayerNorm"), normBias: tensor(normTensors, "norm.bias", "3_LayerNorm"), score };
}

function applyDense(layer: DenseLayer, input: Float32Array): Float32Array {
  const inDim = input.length;
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
  return Array.from({ length: rows }, (_, row) => {
    const cls = hidden.subarray(row * seq * dim, row * seq * dim + dim);
    const normed = layerNorm(applyDense(head.dense, cls), head.normWeight, head.normBias);
    return applyDense(head.score, normed)[0] ?? 0;
  });
}
