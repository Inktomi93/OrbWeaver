// domain/roster-preset/contract/errors — typed domain errors over the kit primitives (the persona
// precedent: distinctly-named classes so an instanceof can never match a sibling domain's). The
// not-owned and not-found answers COLLAPSE by construction (owner-scoped reads), so none of these is a
// foreign-existence oracle.

import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, PersonaId, RosterPresetId } from "@orb/kit/ids";

export class RosterPresetNotFoundError extends DomainNotFoundError {
  public readonly presetId: RosterPresetId;
  constructor(presetId: RosterPresetId) {
    super("roster preset", presetId);
    this.presetId = presetId;
    this.name = this.constructor.name;
  }
}

/** Thrown by create/update when a member `characterId` is missing or not the caller's (the FK proves
 *  existence, never ownership — a party must never reference another user's character). */
export class RosterPresetCharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}

/** Thrown by create/update when the anchor `personaId` is missing or not the caller's. */
export class RosterPresetPersonaNotFoundError extends DomainNotFoundError {
  public readonly personaId: PersonaId;
  constructor(personaId: PersonaId) {
    super("persona", personaId);
    this.personaId = personaId;
    this.name = this.constructor.name;
  }
}

/** A party is PICKED BY NAME in the new-chat flow, so `(owner, name)` is unique — a duplicate is this
 *  typed conflict (rename-on-conflict is cheap), never a raw SQLITE_CONSTRAINT surfacing as a 500. */
export class RosterPresetNameConflictError extends DomainConflictError {
  public readonly presetName: string;
  constructor(presetName: string) {
    super(`a saved party named "${presetName}" already exists`);
    this.presetName = presetName;
    this.name = this.constructor.name;
  }
}
