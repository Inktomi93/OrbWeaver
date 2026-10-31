import type { UserRole } from "@orb/contracts/identity";
import {
  DEFAULT_USER_HANDLE_KEY,
  OIDC_ADMIN_GROUPS_KEY,
  OIDC_ALLOWED_GROUPS_KEY,
  OWNER_GROUP_KEY,
  OWNER_HANDLES_KEY,
  RE_DERIVE_ROLE_ON_LOGIN_KEY,
} from "@orb/contracts/identity";
import type { IsReservedSignupHandleOp } from "@orb/contracts/session";
import type { Handle } from "@orb/kit/ids";
import type { Env, EnvKey } from "#foundation/env/record";
import type { IdentityAccess } from "./results.ts";

/** The env keys the role policy reads; their schema and defaults remain in foundation/env. */
export const ROLE_POLICY_ENV_KEYS = [
  DEFAULT_USER_HANDLE_KEY,
  OWNER_HANDLES_KEY,
  OWNER_GROUP_KEY,
  OIDC_ADMIN_GROUPS_KEY,
  OIDC_ALLOWED_GROUPS_KEY,
  RE_DERIVE_ROLE_ON_LOGIN_KEY,
] as const satisfies readonly EnvKey[];

/** The deployment-owned inputs, read from the root's env record. */
export type SessionsRolePolicyConfig = Readonly<Pick<Env, (typeof ROLE_POLICY_ENV_KEYS)[number]>>;

/** One immutable configuration snapshot, shared by boot, identity resolution and account creation. */
export interface SessionsRolePolicy {
  readonly ownerHandles: () => readonly string[];
  readonly isOwnerSeedHandle: (handle: Handle) => boolean;
  readonly isReservedSignupHandle: IsReservedSignupHandleOp;
  readonly isOwnerByPolicy: (handle: Handle, groups: readonly string[]) => boolean;
  readonly isOwnerGroupMember: (groups: readonly string[]) => boolean;
  readonly determineRole: (handle: Handle, groups: readonly string[]) => UserRole;
  readonly deriveIdentityAccess: (handle: Handle, groups: readonly string[]) => IdentityAccess;
  readonly identityAccess: (ownerByPolicy: boolean, groups: readonly string[]) => IdentityAccess;
  readonly groupRoleGovernanceActive: () => boolean;
  readonly reDeriveRoleOnLogin: () => boolean;
}
