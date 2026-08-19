// domain/discovery/substrate/collapse — content-hash collapse (pure; zero I/O). Fork/import copies share a
// content_hash, so N byte-identical vectors would mutually inflate each other's top-K hub mean and bias a
// centroid; collapse picks one representative per distinct hash and collapsed members inherit their rep's
// signal. The rep of a hash group is the row with the smallest id, and reps is ordered by rep id ascending
// so the same input yields the same rep order run-to-run (k-means++ seeding indexes into reps).

export function collapseByHash<T>(rows: readonly T[], hashOf: (row: T) => string, idOf: (row: T) => string): { readonly reps: T[]; readonly repOf: number[] } {
  const repByHash = new Map<string, T>();
  for (const row of rows) {
    const hash = hashOf(row);
    const current = repByHash.get(hash);
    if (current === undefined || idOf(row) < idOf(current)) {
      repByHash.set(hash, row);
    }
  }
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

/**
 * How many pairs the collapse REMOVED — the near-duplicate finder's blind spot, as a number (corpus
 * forensics §5.2). Every group of `k` rows sharing a content hash contributes `k(k−1)/2` pairs that the
 * all-pairs scan can never see, because only one representative survives to be scanned; those pairs are
 * exact duplicates at cosine 1.0, i.e. precisely the ones a user most wants found.
 *
 * Counted over DISTINCT entities per hash (`idOf`), so a card embedded in two spaces is one card, not two.
 * The collapse itself stays — it is right for the clustering passes it was written for (N identical copies
 * would mutually inflate a centroid); what was wrong was reporting its blind spot as a result.
 */
export function collapsedPairCount<T>(rows: readonly T[], hashOf: (row: T) => string, idOf: (row: T) => string): number {
  const idsByHash = new Map<string, Set<string>>();
  for (const row of rows) {
    const hash = hashOf(row);
    const bucket = idsByHash.get(hash);
    if (bucket === undefined) {
      idsByHash.set(hash, new Set([idOf(row)]));
    } else {
      bucket.add(idOf(row));
    }
  }
  let pairs = 0;
  for (const ids of idsByHash.values()) {
    pairs += (ids.size * (ids.size - 1)) / 2;
  }
  return pairs;
}

function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
