// domain/character/contract/errors — typed domain errors. CharacterNotFoundError collapses "missing" and
// "not the caller's" into one answer (no foreign-existence leak). CharacterOperationError is a coded
// operational failure: handle_conflict (per-owner unique index fired) and handle_reserved (a create/update
// tried to occupy the __group__* synthetic namespace).

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AssetId, CharacterId } from "@orb/kit/ids";

export class CharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}

/** Thrown by create/update when a supplied avatarAssetId is missing or not the caller's — the FK alone
 *  proves existence, never ownership. */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

export const CHARACTER_HANDLE_CONFLICT = "handle_conflict";
export const CHARACTER_HANDLE_RESERVED = "handle_reserved";

export class CharacterOperationError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
