// domain/character/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). The wire
// INPUT shapes (`CreateCharacterInput`/`UpdateCharacterInput`) are cross-boundary, so their canonical home
// is `@orb/contracts/character` (the client form + the tRPC router validate the SAME zod schema); they are
// re-exported here TYPE-ONLY so the verb signatures + the front door reference one name. The runtime
// schemas are NOT re-exported (the transport imports them from `@orb/contracts` directly) — keeping this a
// pure-type file (no `z.object` → no contract-test obligation here; the schemas are tested in
// `tests/contracts/character/`).
//
// Every USER-facing verb carries the resolved `principal` (spine §7.1) — ownership is scoped off
// `principal.userId`, the single source of truth for "whose rows" (NEVER a `users` read — the
// `no-direct-users-read` gate). The two SYNTHETIC-identity ops are the exception: they are internal,
// chat-injected, and act on an already-resolved `ownerId` (the room owner), not a request principal.

import type {
  CharacterListCursor,
  CharacterListSort,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, CharacterSnapshotId, ChatId, UserId } from "@orb/kit/ids";

// The library-list sort axis + its sort-discriminated keyset cursor are cross-boundary wire shapes — their
// ONE home is `@orb/contracts/character` (the tRPC router validates the SAME zod schemas the domain types
// derive from). Re-exported TYPE-ONLY so the verb signatures + the front door reference one name (§7.5);
// the runtime schemas stay in contracts (this file is pure-type by design — no `z.object` here).
export type {
  CharacterListCursor,
  CharacterListSort,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "@orb/contracts/character";

/** Common to every owner-scoped character verb: the acting principal whose `userId` scopes ownership. */
export interface CharacterActorParams {
  readonly principal: Principal;
}

/** Import provenance stamp for `create` — present only when an import (not the app) authored the card.
 *  `importHash` is the whole-file sha-256 (the re-import dedup key, DISTINCT from `contentHash`);
 *  `importedFrom` is the source label/filename, or null. Omit for app-authored cards (columns stay null). */
export interface CharacterImportProvenance {
  readonly importedFrom: string | null;
  readonly importHash: string;
}

export interface CreateCharacterParams extends CharacterActorParams {
  readonly input: CreateCharacterInput;
  /** Optional import provenance — undefined for app-authored cards (`imported_from`/`import_hash` ⇒ null). */
  readonly provenance?: CharacterImportProvenance;
}

export interface GetCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface ListCharactersParams extends CharacterActorParams {
  /** The sort order (default `recent` per §4.5). The keyset is sort-discriminated — see
   *  {@link CharacterListCursor}. */
  readonly sort?: CharacterListSort;
  /** The sort-discriminated keyset cursor — fetch the page strictly AFTER this row in the current sort's
   *  order; omit for the first page. Its `sort` discriminant MUST match `sort` (a mismatch is a stale
   *  cursor from a different sort — the verb rejects it rather than apply the wrong keyset). */
  readonly cursor?: CharacterListCursor;
  /** Page size; the verb clamps to a sane max. */
  readonly limit?: number;
}

export interface UpdateCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly input: UpdateCharacterInput;
}

export interface RemoveCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface DuplicateCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface BulkRemoveParams extends CharacterActorParams {
  readonly characterIds: readonly CharacterId[];
}

export interface BulkArchiveParams extends CharacterActorParams {
  readonly characterIds: readonly CharacterId[];
  /** `true` archives, `false` un-archives (the same owner-scoped flip). */
  readonly archived: boolean;
}

export interface BulkAddCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

/** The mirror of {@link BulkAddCardTagParams} — detach a tag by name from many owned characters (the editor
 *  tag-chip remove; the chip passes `[characterId]`). Same shape: owner-scoping skips missing/foreign ids. */
export interface BulkRemoveCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

export interface SnapshotParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  /** Optional human label for the history entry ("the git commit message"). */
  readonly label?: string | null;
}

export interface ListSnapshotsParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface RestoreParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly snapshotId: CharacterSnapshotId;
}

export interface GetCardParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

/** Synthetic group-character mint/find (chat-injected, internal): act on the resolved room `ownerId`, not
 *  a request principal. The `__group__${chatId}` handle namespace is owned here. */
export interface MintGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

export interface FindGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

/** Re-import dedup lookup (import-injected, internal): the owner's character already carrying `importHash`,
 *  acting on the resolved `ownerId` (not a request principal — the synthetic-find precedent). */
export interface FindByImportHashParams {
  readonly ownerId: UserId;
  readonly importHash: string;
}

/** By-handle lookup (seeder-injected, internal): the owner's character carrying `handle` — the default-card
 *  seeder's partial-rerun resolve path (a crashed prior run may have created some handles). Acts on the
 *  resolved `ownerId` (not a request principal — the import-hash/synthetic-find precedent). */
export interface FindByHandleParams {
  readonly ownerId: UserId;
  readonly handle: string;
}
