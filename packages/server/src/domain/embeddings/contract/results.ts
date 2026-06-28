// domain/embeddings/contract/results — the verb output shapes.

/** The outcome of a `store` call. `noop` = the `content_hash` for this `(key, model)` was unchanged, so no
 *  re-embed + no write happened (the staleness gate short-circuited BEFORE the expensive embed). `written` =
 *  a fresh insert or a hash-changed update landed. `contentHash` is the computed hash either way (the caller
 *  may record it for provenance / a downstream collapse key). */
export interface StoreResult {
  readonly outcome: "noop" | "written";
  readonly contentHash: string;
}

/** The outcome of a `writeHubScores` batch — how many rows the `(id, model)`-keyed UPDATE actually touched
 *  (an id/model that matches no row contributes 0; advisory-stale by design). */
export interface WriteHubScoresResult {
  readonly rowsUpdated: number;
}
