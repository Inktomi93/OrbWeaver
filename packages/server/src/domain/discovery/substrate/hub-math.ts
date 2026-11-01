// domain/discovery/substrate/hub-math — the CSLS hubness math (zero I/O; yields to the event loop between bounded batches). The hub score of a vector is
// the mean cosine to its K nearest same-type neighbours: a generic/blank vector close to everything scores
// high (≈1) and is demoted by `search`'s CSLS rerank. Above `HUBNESS_DENSE_MAX` the pass streams row-by-row
// instead of materializing the N×N matrix — the two paths must stay bit-for-bit identical (a fixture asserts it).

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { cosineToMany, pairwiseCosineCooperative } from "@orb/kit/vector-math";

/** The CSLS neighbour count — the K nearest same-type vectors whose cosine is averaged into a hub score. */
const CSLS_K = 10;

/** The dense-vs-streaming switch (≈100MB N×N float32 matrix at N=5000). */
export const HUBNESS_DENSE_MAX = 5000;

/** Multiply-adds (or offer steps) between two yields: a few milliseconds of synchronous work, so the in-process
 *  worker never holds HTTP, SSE or heartbeats for the length of a large group. */
export const HUB_YIELD_WORK_BUDGET = 8_000_000;

/** Relative cost of one top-K offer against one multiply-add (an insertion sort step). */
const OFFER_COST = 16;

type Pace = (units: number) => Promise<void>;

/** Yields once `HUB_YIELD_WORK_BUDGET` units have been spent, and refuses to continue after an abort. */
function createPacer(signal: AbortSignal | undefined): Pace {
  let spent = 0;
  return async (units) => {
    spent += units;
    if (spent >= HUB_YIELD_WORK_BUDGET) {
      spent = 0;
      await yieldToEventLoop();
      signal?.throwIfAborted();
    }
  };
}

function offer(top: number[], value: number, k: number): void {
  if (top.length < k) {
    top.push(value);
    top.sort((a, b) => a - b);
    return;
  }
  const min = top[0] ?? Number.NEGATIVE_INFINITY;
  if (value > min) {
    top[0] = value;
    top.sort((a, b) => a - b);
  }
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

function topKMean(at: (j: number) => number, n: number, skip: number, k: number): number {
  const top: number[] = [];
  for (let j = 0; j < n; j += 1) {
    if (j !== skip) {
      offer(top, at(j), k);
    }
  }
  return meanOf(top);
}

/**
 * The hub score of each of `vecs` — the mean cosine to its `k` nearest other vectors (self excluded). A
 * group of fewer than 2 vectors yields all-zero. `denseMax` selects the materialization strategy. The pass
 * yields to the event loop every bounded batch and throws the signal's reason once it aborts; the scores
 * do not depend on where it yields.
 */
export async function computeGroupHubs(
  vecs: readonly Float32Array[],
  opts: { readonly k?: number | undefined; readonly denseMax?: number | undefined; readonly signal?: AbortSignal | undefined } = {},
): Promise<number[]> {
  const n = vecs.length;
  const k = opts.k ?? CSLS_K;
  const denseMax = opts.denseMax ?? HUBNESS_DENSE_MAX;
  if (n < 2) {
    return new Array<number>(n).fill(0);
  }
  const pace = createPacer(opts.signal);
  return n <= denseMax ? await denseHubs(vecs, n, k, pace) : await streamingHubs(vecs, n, k, pace);
}

async function denseHubs(vecs: readonly Float32Array[], n: number, k: number, pace: Pace): Promise<number[]> {
  const { sim } = await pairwiseCosineCooperative(vecs, pace);
  const hubs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const base = i * n;
    hubs[i] = topKMean((j) => sim[base + j] ?? 0, n, i, k);
    await pace(n * OFFER_COST);
  }
  return hubs;
}

// Bit-identical to denseHubs (same normalized dot products, same top-K selection), O(N) memory.
async function streamingHubs(vecs: readonly Float32Array[], n: number, k: number, pace: Pace): Promise<number[]> {
  const hubs = new Array<number>(n);
  const dim = vecs[0]?.length ?? 0;
  for (let i = 0; i < n; i += 1) {
    const target = vecs[i];
    if (target === undefined) {
      hubs[i] = 0;
      continue;
    }
    const row = cosineToMany(target, vecs);
    hubs[i] = topKMean((j) => row[j] ?? 0, n, i, k);
    await pace(n * (dim * 2 + OFFER_COST));
  }
  return hubs;
}
