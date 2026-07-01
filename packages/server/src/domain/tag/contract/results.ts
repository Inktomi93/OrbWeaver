// domain/tag/contract/results — verb return shapes that are NOT a view re-export. Most tag verbs return a
// `TagView` / `TagWithUsage` (contract/views) or `void`; `pruneUnusedTags` returns a count.

/** `pruneUnusedTags` — how many zero-usage tags were removed. */
export interface PruneUnusedResult {
  readonly removed: number;
}


