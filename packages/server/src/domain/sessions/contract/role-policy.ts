import type { UserRole } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { env } from "#foundation/env";
import type { IdentityAccess } from "./results.ts";

/** The deployment-owned inputs; their schema and defaults remain in foundation/env. */
export type SessionsRolePolicyConfig = Readonly<
  Pick<typeof env, "DEFAULT_USER_HANDLE" | "OWNER_HANDLES" | "OWNER_GROUP" | "OIDC_ADMIN_GROUPS" | "OIDC_ALLOWED_GROUPS" | "RE_DERIVE_ROLE_ON_LOGIN">
>;

/** One immutable configuration snapshot, shared by boot, identity resolution and account creation. */
export interface SessionsRolePolicy {
  readonly ownerHandles: () => readonly string[];
  readonly isOwnerSeedHandle: (handle: Handle) => boolean;
  readonly isReservedSignupHandle: (handle: Handle) => boolean;
  readonly isOwnerByPolicy: (handle: Handle, groups: readonly string[]) => boolean;
  readonly isOwnerGroupMember: (groups: readonly string[]) => boolean;
  readonly determineRole: (handle: Handle, groups: readonly string[]) => UserRole;
  readonly deriveIdentityAccess: (handle: Handle, groups: readonly string[]) => IdentityAccess;
  readonly identityAccess: (ownerByPolicy: boolean, groups: readonly string[]) => IdentityAccess;
  readonly groupRoleGovernanceActive: () => boolean;
  readonly reDeriveRoleOnLogin: () => boolean;
}
