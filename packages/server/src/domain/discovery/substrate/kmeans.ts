// domain/discovery/substrate/kmeans — Lloyd's algorithm with k-means++ seeding (pure; zero I/O). Clusters
// L2-normalized vectors so squared-Euclidean ranks AS cosine (the embedding space's metric). Was neo-tavern
// `corpus/substrate/kmeans.ts`; its `providers/_shared` import is swapped for `@orb/kit/vector-math`.
//
// ESOTERIC #6 (load-bearing — discovery.md): the returned centroids are RE-NORMALIZED, so a downstream
// `cosineDistance` against them ranks the SAME way the clusterer's argmin did near the tail. Skip the return-
// normalize and theme/archetype ASSIGNMENTS quietly disagree with the CLUSTERING.
//
// DETERMINISM: the k-means++ seeding randomness comes from an INJECTED integer `seed` (a linear-congruential
// PRNG) — no `Math.random()` (test-determinism). Same (vecs, k, seed) ⇒ same clustering, run to run.

import { cosineSim, l2Normalize, mean } from "@orb/kit/vector-math";

/** The clustering result: `centroids[c]` is cluster c's normalized mean; `assignments[i]` is the cluster
 *  index point i belongs to. File-local — consumers infer it (no exported type leak; `no-inline-types`). */
interface KmeansResult {
  readonly centroids: Float32Array[];
  readonly assignments: number[];
}

const MAX_ITERS = 50;
/** Squared cosine-distance of two NORMALIZED vectors: `2·(1 − cos)` (the k-means++ seeding weight). */
const SQ_DIST_SCALE = 2;

// LCG constants (Numerical Recipes): `state = (A·state + C) mod 2³²`. `A·state` peaks ≈ 7.15e15 < 2⁵³, so the
// arithmetic stays exact in float64 — no bitwise ops (biome `noBitwiseOperators`).
const LCG_A = 1_664_525;
const LCG_C = 1_013_904_223;
const LCG_M = 4_294_967_296;

/** A deterministic [0,1) PRNG seeded by an integer (a linear-congruential generator) — replaces `Math.random`
 *  for k-means++ seeding so the same seed reproduces the same clustering. */
function createRng(seed: number): () => number {
  let state = ((seed % LCG_M) + LCG_M) % LCG_M;
  return (): number => {
    state = (LCG_A * state + LCG_C) % LCG_M;
    return state / LCG_M;
  };
}

/** Index of the nearest centroid to `point` (max cosine = min distance; both sides are normalized). */
function nearestCentroid(point: Float32Array, centroids: readonly Float32Array[]): number {
  let best = 0;
  let bestSim = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < centroids.length; c += 1) {
    const centroid = centroids[c];
    if (centroid === undefined) {
      continue;
    }
    const sim = cosineSim(point, centroid);
    if (sim > bestSim) {
      bestSim = sim;
      best = c;
    }
  }
  return best;
}

/** Assign every point to its nearest centroid (a fresh array each pass — no loop-captured closure). */
function assignAll(points: readonly Float32Array[], centroids: readonly Float32Array[]): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    out[i] = p === undefined ? 0 : nearestCentroid(p, centroids);
  }
  return out;
}

/** Whether two assignment arrays are element-wise equal (the Lloyd fixed-point test). */
function sameAssignments(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** The squared cosine-distance from `p` to its nearest chosen centroid (the k-means++ pick weight). */
function nearestSqDist(p: Float32Array, centroids: readonly Float32Array[]): number {
  const nearest = centroids[nearestCentroid(p, centroids)] ?? p;
  return Math.max(0, SQ_DIST_SCALE * (1 - cosineSim(p, nearest)));
}

/** k-means++ seeding: pick `k` initial centroids, each (after the first) chosen with probability ∝ its
 *  squared cosine-distance to the nearest already-chosen centroid (spreads the seeds). */
function kmeansPlusPlus(
  points: readonly Float32Array[],
  k: number,
  rng: () => number,
): Float32Array[] {
  const first = points[Math.floor(rng() * points.length)] ?? points[0];
  if (first === undefined) {
    return [];
  }
  const centroids: Float32Array[] = [first];
  while (centroids.length < k) {
    const weights = points.map((p) => nearestSqDist(p, centroids));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) {
      break; // every point coincides with a chosen centroid — no further spread possible.
    }
    centroids.push(pickWeighted(points, weights, rng() * total));
  }
  return centroids;
}

/** The point at the cumulative-weight threshold `r` (the roulette-wheel pick); last point as the fallback. */
function pickWeighted(
  points: readonly Float32Array[],
  weights: readonly number[],
  threshold: number,
): Float32Array {
  let r = threshold;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i] ?? 0;
    if (r <= 0) {
      const pick = points[i];
      if (pick !== undefined) {
        return pick;
      }
    }
  }
  // Guaranteed non-undefined: kmeansPlusPlus only calls this when total weight > 0 (so points is non-empty).
  return points.at(-1) as Float32Array;
}

/** Recompute each cluster's centroid as the normalized mean of its members (esoteric #6); an empty cluster
 *  keeps its previous centroid (no members ⇒ no movement). */
function recenter(
  points: readonly Float32Array[],
  assignments: readonly number[],
  prev: readonly Float32Array[],
): Float32Array[] {
  return prev.map((prevCentroid, c) => {
    const members = points.filter((_, i) => assignments[i] === c);
    return members.length === 0 ? prevCentroid : l2Normalize(mean(members));
  });
}

/**
 * Cluster `vecs` into at most `k` groups (k-means++ seed → Lloyd iterations to a fixed point or
 * {@link MAX_ITERS}). Inputs are L2-normalized; centroids are returned NORMALIZED (esoteric #6). `k` is
 * clamped to `[1, vecs.length]`. Empty input ⇒ empty result.
 */
export function kmeans(vecs: readonly Float32Array[], k: number, seed: number): KmeansResult {
  const n = vecs.length;
  if (n === 0) {
    return { centroids: [], assignments: [] };
  }
  const points = vecs.map((v) => l2Normalize(v));
  const effectiveK = Math.max(1, Math.min(k, n));
  const rng = createRng(seed);

  let centroids = kmeansPlusPlus(points, effectiveK, rng);
  let assignments = assignAll(points, centroids);
  for (let iter = 0; iter < MAX_ITERS; iter += 1) {
    centroids = recenter(points, assignments, centroids);
    const next = assignAll(points, centroids);
    const stable = sameAssignments(next, assignments);
    assignments = next;
    if (stable) {
      break;
    }
  }
  return { centroids, assignments };
}
