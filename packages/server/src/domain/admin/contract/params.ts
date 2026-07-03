// domain/admin/contract/params — every verb's *Params, declared ONCE (§7.4 — neo re-spelled the
// `{ actorId; callerRole?; userId; role }` object ~9×). Under the Principal model the loose `actorId` +
// `callerRole` fields collapse into ONE `principal: Principal` (resolved at the entry seam, carries its
// role) — the verb gates on the principal it is handed (spine §1). The handle/password STRINGS are raw
// here (validated at the verb/transport boundary); `role`/ids are branded.

import type { Principal, UserKind, UserRole } from "@orb/contracts/identity";
import type { CharacterId, SessionId, UserId } from "@orb/kit/ids";

/** Common to every admin verb: the acting principal the guard reads. */
export interface AdminActorParams {
  readonly principal: Principal;
}

export interface ListUsersParams extends AdminActorParams {
  /** Filter by principal kind (D60 — the Humans/Agents tab off one procedure). Absent = ALL (default): an
   *  invisible principal is the one thing the containment surface must never have. */
  readonly kind?: UserKind;
}

export interface SetRoleParams extends AdminActorParams {
  readonly userId: UserId;
  /** Target role — `user ↔ admin` only; granting/revoking `owner` is refused (owner is immutable, D17). */
  readonly role: UserRole;
}

export interface SetEnabledParams extends AdminActorParams {
  readonly userId: UserId;
  readonly enabled: boolean;
}

export interface CreateUserParams extends AdminActorParams {
  readonly handle: string;
  readonly password: string;
  /** Defaults to `user` when omitted; `owner` is refused (the owner is the bootstrap row, never minted). */
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

/** `embedCharacterCard` — the inline single-card embed (PD-90). The producer FK is validated against the
 *  caller (the composed port's owner-scoped card read); the vector row itself carries NO owner (D20). */
export interface EmbedCharacterCardParams extends AdminActorParams {
  readonly characterId: CharacterId;
}
