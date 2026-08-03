// domain/persona/contract/params — every verb's *Params, declared once. The wire input shapes
// (CreatePersonaInput/UpdatePersonaInput) are cross-boundary and homed in @orb/contracts/persona,
// re-exported here type-only. Every verb carries the resolved principal; ownership is scoped off
// principal.userId (never a users read — no-direct-users-read gate).

import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput, UpdatePersonaInput } from "@orb/contracts/persona";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";

export type { CreatePersonaInput, UpdatePersonaInput } from "@orb/contracts/persona";

interface PersonaActorParams {
  readonly principal: Principal;
}

export interface CreatePersonaParams extends PersonaActorParams {
  readonly input: CreatePersonaInput;
}

export interface ListPersonasParams extends PersonaActorParams {}

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

export interface ExportPersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

/** The FILE is the unit (the thin-arm law): the single-entity door and the bundle descriptor hand the same
 *  bytes to the same verb, so the two paths can never drift. Never carries avatarAssetId — the backup shape
 *  (personaBackupSchema) excludes it. */
export interface ImportPersonaParams extends PersonaActorParams {
  readonly bytes: Uint8Array;
}
