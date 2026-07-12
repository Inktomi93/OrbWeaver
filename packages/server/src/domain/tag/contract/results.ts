// domain/tag/contract/results — verb return shapes that are NOT a view re-export. Most tag verbs return a
// `TagView` / `TagWithUsage` (contract/views) or `void`; `pruneUnusedTags` returns a count.

/** `pruneUnusedTags` — how many zero-usage tags were removed. */
export interface PruneUnusedResult {
  readonly removed: number;
}

/** `importTagLibrary` — the outcome of restoring a tag-library file. `total` is the tag count the file
 *  carried (post-parse, malformed rows already dropped); `created` is how many were NEWLY minted into the
 *  owner's namespace (the rest deduped against existing tags — the import merges, idempotently). */
export interface TagLibraryImportResult {
  readonly total: number;
  readonly created: number;
}
