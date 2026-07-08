// domain/persona/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). The wire
// INPUT shapes (`CreatePersonaInput`/`UpdatePersonaInput`) are cross-boundary, so their home is
// `@orb/contracts/persona` (the client form + the tRPC router validate the SAME zod schema); they are
// re-exported here TYPE-ONLY so the verb signatures + the front door reference one name. The runtime
// schemas are NOT re-exported (the transport imports them from `@orb/contracts` directly) — keeping this a
// pure-type file (no `z.object` → no contract-test obligation here; the schemas are tested in
// `tests/contracts/persona/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose rows" (NEVER a `users` read — the `no-direct-users-read` gate).

import type { Principal } from "@orb/contracts/identity";
import type {
  CreatePersonaInput,
  PersonaBackupInput,
  UpdatePersonaInput,
} from "@orb/contracts/persona";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";

export type {
  CreatePersonaInput,
  PersonaBackupInput,
  UpdatePersonaInput,
} from "@orb/contracts/persona";

export interface PersonaActorParams {
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
  /** Swap `{{char}}` ↔ `{{user}}` in the copied description (roles invert in a persona POV). */
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
  /** Omit to target the CALLER (the common self-case — no need to name yourself). A host setting
   *  someone else's persona passes this explicitly; the verb still gates via `requireChatAuthorOrHost`. */
  readonly targetUserId?: UserId | undefined;
  readonly personaId: PersonaId | null;
}

/** `duplicate` — clone an owned persona into a fresh row (FINAL-Persona §A.6b gap #2). */
export interface DuplicatePersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

/** `export` — read an owned persona as the portable backup shape (gap #3). */
export interface ExportPersonaParams extends PersonaActorParams {
  readonly personaId: PersonaId;
}

/** `import` — mint a fresh owned persona from a backup blob (gap #3). Never carries `avatarAssetId`
 *  (the backup shape excludes it — see `@orb/contracts/persona` `personaBackupSchema`). */
export interface ImportPersonaParams extends PersonaActorParams {
  readonly input: PersonaBackupInput;
}
