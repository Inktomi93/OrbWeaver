// Persona verb parameters derive wire inputs from @orb/contracts/persona.
// Resolved principals carry ownership; verbs scope by principal.userId.

import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput, IncomingPersona, UpdatePersonaInput } from "@orb/contracts/persona";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";

interface PersonaActorParams {
  readonly principal: Principal;
}

export interface CreatePersonaParams extends PersonaActorParams {
  readonly input: CreatePersonaInput;
}

export interface GetPersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

export interface UpdatePersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
  readonly input: UpdatePersonaInput;
}

export interface RemovePersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

export interface CreateFromCharacterParams extends PersonaActorParams {
  readonly characterId: CharacterId;
  /** Swap \{\{char\}\} ↔ \{\{user\}\} in the copied description (roles invert in a persona POV). */
  readonly swapMacros: boolean;
}

export interface ConnectParams extends PersonaActorParams {
  readonly characterId: CharacterId;
  readonly personaId: PersonaId;
}

export interface DisconnectParams extends PersonaActorParams {
  readonly characterId: CharacterId;
  readonly personaId: PersonaId;
}

export interface ListConnectedParams extends PersonaActorParams {
  readonly characterId: CharacterId;
}

export interface ListConnectedCharactersParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

export interface SetActivePersonaParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  /** Omit to target the caller; a host setting someone else's persona passes this explicitly. */
  readonly targetUserId?: UserId | undefined;
  readonly personaId: PersonaId | null;
}

export interface DuplicatePersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

/** The pre-commit read of a profile import: which incoming personas would collide with an owned one. */
export interface ReviewPersonaImportParams extends PersonaActorParams {
  readonly incoming: readonly IncomingPersona[];
}
