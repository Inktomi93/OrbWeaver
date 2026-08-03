// domain/admin/contract/params — every verb's *Params, declared once. The loose actorId + callerRole
// fields collapse into one principal: Principal (resolved at the entry seam) — the verb gates on the
// principal it is handed. Handle/password strings are raw here, validated at the verb/transport boundary.

import type { Principal, UserKind, UserRole } from "@orb/contracts/identity";
import type { CharacterId, Handle, SessionId, UserId } from "@orb/kit/ids";

interface AdminActorParams {
  readonly principal: Principal;
}

export interface ListUsersParams extends AdminActorParams {
  /** Absent = all — an invisible principal is the one thing the containment surface must never have. */
  readonly kind?: UserKind;
}

export interface SetRoleParams extends AdminActorParams {
  readonly userId: UserId;
  /** user ↔ admin only; granting/revoking owner is refused (owner is immutable). */
  readonly role: UserRole;
}

export interface SetEnabledParams extends AdminActorParams {
  readonly userId: UserId;
  readonly enabled: boolean;
}

export interface CreateUserParams extends AdminActorParams {
  readonly handle: Handle;
  readonly password: string;
  /** Defaults to user when omitted; owner is refused (the bootstrap row, never minted). */
  readonly role?: UserRole;
}

export interface ResetPasswordParams extends AdminActorParams {
  readonly userId: UserId;
  readonly password: string;
}

export interface ListSessionsParams extends AdminActorParams {
  readonly userId: UserId;
}

export interface RevokeSessionParams extends AdminActorParams {
  readonly sessionId: SessionId;
}

export interface RevokeUserSessionsParams extends AdminActorParams {
  readonly userId: UserId;
}

export interface VllmEnginesParams extends AdminActorParams {}

export interface RestartVllmEngineParams extends AdminActorParams {
  readonly engine: string;
}

export interface EmbedCharacterCardParams extends AdminActorParams {
  readonly characterId: CharacterId;
}
