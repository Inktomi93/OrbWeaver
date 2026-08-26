// domain/stats/substrate/percentiles — the pure avg/p50/p90 over a float array (zero I/O). A percentile
// isn't additively mergeable, so latency can't ride the `+=` rollup write path — it's computed ON READ
// (persistence/latency.ts) over a bounded canon scan, and THIS is the math it folds the scanned values
// through. Substrate, not persistence: no db, no domain (movement table — pure helper lands in substrate/).

const P50 = 0.5;
const P90 = 0.9;

/** avg / p50 / p90 of `arr` (each `null` for an empty input). Nearest-rank percentile: the value at
 *  `ceil(p·n) − 1` (clamped to the valid index range). A single-pass sort + reduce — O(n log n), bounded by the
 *  caller's scan size. */
export function percentiles(arr: number[]): {
  avg: number | null;
  p50: number | null;
  p90: number | null;
} {
  if (arr.length === 0) {
    return { avg: null, p50: null, p90: null };
  }
  const sorted = arr.toSorted((a, b) => a - b);
  const n = sorted.length;
  const at = (p: number): number => sorted[Math.max(0, Math.min(n - 1, Math.ceil(p * n) - 1))] ?? 0;
  const avg = sorted.reduce((s, v) => s + v, 0) / n;
  return { avg, p50: at(P50), p90: at(P90) };
}
