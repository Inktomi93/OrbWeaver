// domain/admin/contract/params — every verb's *Params, declared once. The loose actorId + callerRole
// fields collapse into one principal: Principal (resolved at the entry seam) — the verb gates on the
// principal it is handed. Handle/password strings are raw here, validated at the verb/transport boundary.

import type { Principal, UserKind, UserRole } from "@orb/contracts/identity";
import type { CharacterId, ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";

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

/** The explicit confirm is typed `true`, so no caller reaches the verb without it; the router refuses any other value. */
export interface RestartParams extends AdminActorParams {
  readonly confirm: true;
}

export interface ResetPasswordParams extends AdminActorParams {
  readonly userId: UserId;
  readonly password: string;
}

/** B5 — link an existing (non-owner, human) row to a STABLE SSO subject. `externalId` is an IdP-stable id
 *  (authentik `sub`/`uid`), NEVER an email — the verb refuses the owner/agent target and a subject already
 *  bound elsewhere. */
export interface LinkSsoIdentityParams extends AdminActorParams {
  readonly userId: UserId;
  readonly externalId: ExternalId;
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

export interface EmbedCharacterCardParams extends AdminActorParams {
  readonly characterId: CharacterId;
}
