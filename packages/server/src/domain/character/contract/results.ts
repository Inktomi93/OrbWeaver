// domain/character/contract/results — the thin result shapes that aren't a `CharacterDetail`/`void`
// (one home, §7.4). The CRUD reads return `CharacterDetail` (views.ts); the bulk mutators return `void`.
// Only the history + synthetic-identity verbs carry their own small shapes.

import type { CharacterId, CharacterSnapshotId } from "@orb/kit/ids";
import type { CharacterListCursor } from "./params";
import type { CharacterSummary } from "./views";

/** A handle to a character identity row — the return of the injected synthetic-group mint/find ops
 *  (chat consumes it cross-feature; type-only re-exported from the front door). */
export interface CharacterRef {
  readonly characterId: CharacterId;
}

/** Returned by `snapshot`. */
export interface SnapshotRef {
  readonly id: CharacterSnapshotId;
  readonly characterId: CharacterId;
  readonly createdAt: number;
}

/** A browse-history row (the git "commit log" entry); the opaque blob itself is read only on `restore`. */
export interface SnapshotSummary {
  readonly id: CharacterSnapshotId;
  readonly label: string | null;
  readonly createdAt: number;
}

/** A cursor page of the caller's own character library — newest-first, synthetic buckets excluded
 *  (invariant 3). Mirrors `domain/notifications`'s `ListInboxResult` `{items, nextCursor}` shape. */
export interface ListCharactersResult {
  readonly items: readonly CharacterSummary[];
  /** The `(createdAt, id)` pair to pass as the next `cursor`, or `null` when a short page came back
   *  (no older character remains). */
  readonly nextCursor: CharacterListCursor | null;
}
