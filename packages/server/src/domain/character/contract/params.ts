// domain/character/contract/params — every verb's *Params, declared ONCE. Every USER-facing verb carries
// the resolved principal; ownership scopes off principal.userId, never a users read. The synthetic-identity
// ops (Mint/Find/FindByImportHash/FindByHandle) are internal and act on an already-resolved ownerId.

import type {
  CharacterListCursor,
  CharacterListSort,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, CharacterSnapshotId, ChatId, UserId } from "@orb/kit/ids";

export type { CharacterListCursor, CharacterListSort } from "@orb/contracts/character";

interface CharacterActorParams {
  readonly principal: Principal;
}

/** Import provenance stamp for `create`; importHash is the whole-file sha-256 dedup key, distinct from
 *  contentHash. Omit for app-authored cards. */
export interface CharacterImportProvenance {
  readonly importedFrom: string | null;
  readonly importHash: string;
}

export interface CreateCharacterParams extends CharacterActorParams {
  readonly input: CreateCharacterInput;
  readonly provenance?: CharacterImportProvenance;
}

export interface GetCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface ListCharactersParams extends CharacterActorParams {
  readonly sort?: CharacterListSort;
  /** Cursor's sort discriminant MUST match `sort`; a mismatch is rejected rather than applying the wrong keyset. */
  readonly cursor?: CharacterListCursor;
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
  readonly archived: boolean;
}

export interface BulkAddCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

export interface BulkRemoveCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

export interface SnapshotParams extends CharacterActorParams {
  readonly characterId: CharacterId;
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

/** Synthetic group-character mint/find (chat-injected, internal); owns the `__group__${chatId}` handle namespace. */
export interface MintGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

export interface FindGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

/** Re-import dedup lookup (import-injected, internal): the owner's character already carrying importHash. */
export interface FindByImportHashParams {
  readonly ownerId: UserId;
  readonly importHash: string;
}

/** By-handle lookup (seeder-injected, internal): the default-card seeder's partial-rerun resolve path. */
export interface FindByHandleParams {
  readonly ownerId: UserId;
  readonly handle: string;
}
