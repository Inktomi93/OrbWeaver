// domain/persona/contract/errors — typed domain errors, extending the kit DomainNotFoundError primitive so
// the transport maps them to NOT_FOUND uniformly while callers/tests discriminate the specific entity.
// Named distinctly from domain/character's own CharacterNotFoundError — two domains can't share an error
// class, and a same-named class in each would let an instanceof check silently match the wrong domain.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AssetId, CharacterId, PersonaId } from "@orb/kit/ids";

export class PersonaNotFoundError extends DomainNotFoundError {
  public readonly personaId: PersonaId;
  constructor(personaId: PersonaId) {
    super("persona", personaId);
    this.personaId = personaId;
    this.name = this.constructor.name;
  }
}

export class PersonaCharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}

/** Thrown by create/update when a supplied `avatarAssetId` is missing or not the caller's. */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

/** `remove` refuses to delete the caller's last persona — deleting it would strand chat attribution at
 *  personaId: null. */
export class LastPersonaError extends DomainOperationError {
  public readonly personaId: PersonaId;
  constructor(personaId: PersonaId) {
    super("last_persona", `persona ${personaId}: cannot delete the last persona`);
    this.personaId = personaId;
    this.name = this.constructor.name;
  }
}
