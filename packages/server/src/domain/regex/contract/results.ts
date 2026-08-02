// domain/regex/contract/results — the thin result shapes for the verbs that don't return a row view. One
// home for the shapes (types-in-contract).

/** `removeScript` — `deleted` is always `true` on success (a not-owned/missing target throws
 *  `RegexNotFoundError` instead; the DB CASCADE clears every junction row). */
export interface RemoveResult {
  readonly deleted: boolean;
}

/** `detachFrom{Character,Preset,Chat}` / `detachGlobal` — `false` when the junction row was already absent
 *  (idempotent no-op), `true` when a row was removed. */
export interface DetachResult {
  readonly detached: boolean;
}

/** `applyScopeOrder` — how many attachments had their `position` rewritten. */
export interface ReorderResult {
  readonly reordered: number;
}
