// domain/world-info/contract/results — the thin result shapes for the verbs that don't return a view. Most
// verbs return a `BookView`/`EntryView`/`BookAttachmentView[]` (contract/views.ts); these carry the
// discriminant the caller acts on (did a row actually go away / how many changed?). One home for the shapes
// (§7.4 / types-in-contract).

/** `removeBook` / `removeEntry` — `deleted` is always `true` on success (a not-owned/missing target throws
 *  `WorldInfoNotFoundError` instead; the DB CASCADE clears the children + junction rows). */
export interface RemoveResult {
  readonly deleted: boolean;
}

/** `detachFrom{Character,Persona}` / `detachGlobal` — `false` when the junction row was already absent
 *  (idempotent no-op), `true` when a row was removed. */
export interface DetachResult {
  readonly detached: boolean;
}

/** `backfillTitles` — how many blank-titled entries were filled (title derived from the entry's keys). */
export interface BackfillResult {
  readonly filled: number;
}

/** `applyEntryOrder` — how many entries had their order (the `priority` column) rewritten. */
export interface ReorderResult {
  readonly reordered: number;
}
