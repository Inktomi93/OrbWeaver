// domain/persona/contract/errors — the typed domain errors. Both extend the kit `DomainNotFoundError`
// primitive so the transport maps them to NOT_FOUND uniformly, while callers/tests can discriminate the
// specific entity past the base (`rejects.toBeInstanceOf(PersonaNotFoundError)`).
//
// `PersonaCharacterNotFoundError` is thrown by the connection/createFromCharacter verbs when the referenced
// character is missing OR not the caller's — the persona domain reads the `characters` table directly for
// the ownership gate (a sanctioned SCHEMA read, not a character-domain runtime import — see
// persistence/queries.ts `ensureCharacterOwned`). "not yours" and "doesn't exist" collapse into one
// answer (no foreign-existence leak), mirroring the owner-scoped persona reads.
//
// Named distinctly from `domain/character`'s OWN `CharacterNotFoundError` (PD-125) — two domains can't
// share an error class under the cake (no cross-domain import), but a same-named class in each would let
// an `instanceof`/name identity check silently match the wrong domain's error. The `Persona` prefix makes
// the two unambiguous at every call site and in any error-identity check.

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

/** Thrown by create/update when a supplied `avatarAssetId` is missing OR not the caller's — the D21
 *  cross-root belt (assets are per-user; the FK alone proves existence, never ownership). Same
 *  leak-free collapse as the gates above (see persistence/queries.ts `ensureAssetOwned`). */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

/**
 * `remove` refuses to delete the caller's LAST persona (code `last_persona` → BAD_REQUEST). The
 * always-one-persona invariant (PD-100 rider): setup forces a persona, and chat attribution now falls back
 * to the participant's active persona — deleting the final one would strand every future user line at
 * `personaId: null`.
 */
export class LastPersonaError extends DomainOperationError {
  public readonly personaId: PersonaId;
  constructor(personaId: PersonaId) {
    super("last_persona", `persona ${personaId}: cannot delete the last persona`);
    this.personaId = personaId;
    this.name = this.constructor.name;
  }
}
