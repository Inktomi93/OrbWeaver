// Candidate-index text for paths whose staged blob differs from the working tree. The tracked-files
// declaration owns the path population; this is its byte-bearing companion, not a new resource kind.
// Returning only the divergence is the useful contract: when index and worktree bytes agree the ordinary
// authored-text read already judges the same content, while a differing index blob is the commit-time fact
// a working-tree reader cannot see.

export interface CandidateIndexTextFile {
  readonly path: string;
  readonly text: string;
}

export interface CandidateIndexDelta {
  /** One row per demanded tracked path whose index blob differs from its working-tree entry. */
  readonly files: readonly CandidateIndexTextFile[];
}
