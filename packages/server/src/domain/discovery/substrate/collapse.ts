// domain/discovery/substrate/collapse — content-hash collapse (pure; zero I/O). Fork/import copies share a
// content_hash, so N byte-identical vectors would mutually inflate each other's top-K hub mean and bias a
// centroid; collapse picks one representative per distinct hash and collapsed members inherit their rep's
// signal. The rep of a hash group is the row with the smallest id, and reps is ordered by rep id ascending
// so the same input yields the same rep order run-to-run (k-means++ seeding indexes into reps).

export function collapseByHash<T>(
  rows: readonly T[],
  hashOf: (row: T) => string,
  idOf: (row: T) => string,
): { readonly reps: T[]; readonly repOf: number[] } {
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

function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
