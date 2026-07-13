/** noop = content_hash unchanged, no re-embed/write happened; written = a fresh insert or hash-changed update landed. */
export interface StoreResult {
  readonly outcome: "noop" | "written";
  readonly contentHash: string;
}

export interface WriteHubScoresResult {
  readonly rowsUpdated: number;
}

/** Resumable: embedded = items with at least one fresh vector row this run; skipped = already embedded or vanished. */
export interface BulkEmbedResult {
  readonly embedded: number;
  readonly skipped: number;
}
