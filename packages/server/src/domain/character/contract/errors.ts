// domain/character/contract/errors — the typed domain errors (character.md §8-slot contract/errors.ts).
//   • CharacterNotFoundError — the entity is missing OR isn't the caller's (the two collapse into one
//     answer; no foreign-existence leak), mirroring every owner-scoped read. Extends the kit
//     `DomainNotFoundError` so the transport maps it to NOT_FOUND uniformly while callers/tests can
//     discriminate the specific entity (`rejects.toBeInstanceOf(CharacterNotFoundError)`).
//   • CharacterOperationError — a coded operational failure (the `code` discriminates). The one code in
//     this slice is `handle_conflict` (the per-owner `(ownerId, handle)` unique index fired on create /
//     duplicate). Extends the kit `DomainOperationError` (maps to BAD_REQUEST) so the documented seeder
//     catch (`err instanceof CharacterOperationError && err.code === "handle_conflict"`) holds when the
//     seeder slice lands.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { CharacterId } from "@orb/kit/ids";

export class CharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}

/** The one coded character op-failure in this slice — the `handle_conflict` discriminator. */
export const CHARACTER_HANDLE_CONFLICT = "handle_conflict";

export class CharacterOperationError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
