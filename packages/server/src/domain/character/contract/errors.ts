// domain/character/contract/errors — typed domain errors. CharacterNotFoundError collapses "missing" and
// "not the caller's" into one answer (no foreign-existence leak). CharacterOperationError is a coded
// operational failure: handle_conflict (per-owner unique index fired) and handle_reserved (a create/update
// tried to occupy the __group__* synthetic namespace).

import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_RESERVED_OP_CODE } from "@orb/contracts/character";
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

// DERIVED, never re-spelled (#542, the `CHAT_OP_CODES` precedent): a refusal code is WIRE vocabulary, so it
// is homed in `@orb/contracts/character` where the client can key on it off `data.reason` — the server side
// is an alias so the two can never drift into two spellings of one refusal.
export const CHARACTER_HANDLE_CONFLICT = CHARACTER_HANDLE_CONFLICT_OP_CODE;
export const CHARACTER_HANDLE_RESERVED = CHARACTER_HANDLE_RESERVED_OP_CODE;

/** `update` was given a `kind:"external"` carried-background URL that could not be materialized into an owned
 *  image asset (unreachable / not an image / too large — side-eye F-P0-2). BAD_REQUEST; the message carries
 *  the honest reason, never the URL. */
export const CHARACTER_BACKGROUND_UNAVAILABLE = "background_unavailable";

export class CharacterOperationError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
