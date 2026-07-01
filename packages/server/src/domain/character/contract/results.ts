// domain/character/contract/results — the thin result shapes that aren't a `CharacterDetail`/`void`
// (one home, §7.4). The CRUD reads return `CharacterDetail` (views.ts); the bulk mutators return `void`
// (character.md §Verbs). Only the history + synthetic-identity verbs carry their own small shapes.

import type { CharacterId, CharacterSnapshotId } from "@orb/kit/ids";

/** A handle to a character identity row — the return of the injected synthetic-group mint/find ops
 *  (chat consumes it cross-feature; type-only re-exported from the front door). */
export interface CharacterRef {
  readonly characterId: CharacterId;
}

/** `snapshot` — the appended history blob's id + when it was taken. */
export interface SnapshotRef {
  readonly id: CharacterSnapshotId;
  readonly characterId: CharacterId;
  readonly createdAt: number;
}

/** A browse-history row (the git "commit log" entry) — id + optional label + timestamp; the opaque blob
 *  itself is read only on `restore`. */
export interface SnapshotSummary {
  readonly id: CharacterSnapshotId;
  readonly label: string | null;
  readonly createdAt: number;
}
