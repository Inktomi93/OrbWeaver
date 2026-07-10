// domain/character/contract/errors — the typed domain errors.
//   • CharacterNotFoundError — the entity is missing OR isn't the caller's (the two collapse into one
//     answer; no foreign-existence leak), mirroring every owner-scoped read. Extends the kit
//     `DomainNotFoundError` so the transport maps it to NOT_FOUND uniformly while callers/tests can
//     discriminate the specific entity (`rejects.toBeInstanceOf(CharacterNotFoundError)`).
//   • CharacterOperationError — a coded operational failure (the `code` discriminates). The codes in this
//     slice are `handle_conflict` (the per-owner `(ownerId, handle)` unique index fired on create / update /
//     duplicate) and `handle_reserved` (a create/update tried to occupy the `__group__*` synthetic namespace —
//     the mirror of the `__agent__` refusal at identity surfaces; the namespace is owned by the synthetic
//     group-character mint, so a user card may never squat it). Extends the kit `DomainOperationError` (maps
//     to BAD_REQUEST) so the documented seeder catch (`err instanceof CharacterOperationError && err.code ===
//     "handle_conflict"`) holds when the seeder slice lands.

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

/** Thrown by create/update when a supplied `avatarAssetId` is missing OR not the caller's — the D21
 *  cross-root belt (assets are per-user; the FK alone proves existence, never ownership). Same
 *  leak-free collapse as CharacterNotFoundError (see persistence/queries.ts `ensureAssetOwned`). */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

/** The coded character op-failures in this slice — the `handle_conflict` (collision) + `handle_reserved`
 *  (a create/update tried to occupy the `__group__*` synthetic namespace) discriminators. */
export const CHARACTER_HANDLE_CONFLICT = "handle_conflict";
export const CHARACTER_HANDLE_RESERVED = "handle_reserved";

export class CharacterOperationError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
