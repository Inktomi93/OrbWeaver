// The classic waystone sin-hash: two large unrelated multipliers into sin(), scaled past any float
// grid. The constants carry no meaning beyond "big and unrelated" — that is the whole point of a hash.
// ONE home (was spelled twice — art/web-weave/web-weave-math.ts's `weaveJitter`, charts/meter/
// waystone-geometry.ts's `jitter`) so the two consumers' seeded-random fields can't silently drift.
const HASH_A = 127.1;
const HASH_B = 311.7;
const HASH_SCALE = 43_758.545;

/** Stable pseudo-random in [0,1) from two ints (+ an optional third seed component) — deterministic,
 *  so the same inputs always paint the same field (no `Math.random` in a component, no re-jitter on
 *  every render/paint). An omitted `seed` is a no-op term (`sin(a*A + b*B + 0)`), so a 2-arg caller is
 *  byte-identical to the pre-consolidation 2-arg `jitter`. */
export function sinHash(a: number, b: number, seed = 0): number {
  const n = Math.sin(a * HASH_A + b * HASH_B + seed) * HASH_SCALE;
  return n - Math.floor(n);
}
