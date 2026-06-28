// domain/discovery/substrate/collapse — content-hash collapse (pure; zero I/O). The ONE home for the
// load-bearing pre-pass every all-pairs/clustering computation runs (discovery.md esoteric #3): fork/import
// copies share a `content_hash`, so N byte-identical vectors would mutually inflate each other's top-K hub
// mean to ≈1 (and bias a centroid). Collapse picks ONE representative per distinct hash; the pairwise/
// clustering math runs over the reps, and collapsed members INHERIT their rep's signal (same vector ⇒ same
// hubness). Break the collapse and forks poison every signal.
//
// DETERMINISM: the representative of a hash group is the row with the smallest `id` (string order), and the
// `reps` array is ordered by rep id ascending — so the same input yields the same rep order run-to-run
// (k-means++ seeding indexes into `reps`, so a stable order is load-bearing for reproducibility).

/**
 * Collapse `rows` by content hash. Returns `reps` (one row per distinct hash, the min-id member, ordered by
 * rep id) and `repOf` (index-aligned to `rows`: `repOf[i]` is the position in `reps` of row i's hash's
 * representative). A caller computes a per-rep signal over `reps`, then maps it back to every row via `repOf`.
 */
export function collapseByHash<T>(
  rows: readonly T[],
  hashOf: (row: T) => string,
  idOf: (row: T) => string,
): { readonly reps: T[]; readonly repOf: number[] } {
  // Pick the min-id representative per hash.
  const repByHash = new Map<string, T>();
  for (const row of rows) {
    const hash = hashOf(row);
    const current = repByHash.get(hash);
    if (current === undefined || idOf(row) < idOf(current)) {
      repByHash.set(hash, row);
    }
  }
  // Stable rep order: by rep id ascending (localeCompare-free string order for determinism).
  const reps = [...repByHash.values()].sort((a, b) => compareStr(idOf(a), idOf(b)));
  const repIndexByHash = new Map<string, number>();
  for (let i = 0; i < reps.length; i += 1) {
    const rep = reps[i];
    if (rep !== undefined) {
      repIndexByHash.set(hashOf(rep), i);
    }
  }
  const repOf = rows.map((row) => repIndexByHash.get(hashOf(row)) ?? 0);
  return { reps, repOf };
}

/** Total order over strings (`-1 | 0 | 1`) — code-unit comparison, stable + locale-independent. */
function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
