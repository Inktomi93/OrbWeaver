// Configuration is bound once per graph; verified identity groups remain per-login inputs.
import type { UserRole } from "@orb/contracts/identity";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle } from "@orb/kit/ids";
import type { IdentityAccess } from "../contract/results.ts";
import type { SessionsRolePolicy, SessionsRolePolicyConfig } from "../contract/role-policy.ts";

const CSV_SEPARATOR = ",";
const TRUTHY = new Set(["true", "1", "yes"]);

function csv(raw: string | undefined): readonly string[] {
  return Object.freeze(
    (raw ?? "")
      .split(CSV_SEPARATOR)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function intersects(a: readonly string[], b: readonly string[]): boolean {
  return a.some((entry) => b.includes(entry));
}

/** Bind the sessions-owned rules to a copied deployment configuration, never mutable process state. */
export function createSessionsRolePolicy(config: SessionsRolePolicyConfig): SessionsRolePolicy {
  const defaultHandle = config.DEFAULT_USER_HANDLE;
  const rawHandles = config.OWNER_HANDLES;
  const handles = rawHandles !== undefined && rawHandles.trim().length > 0 ? csv(rawHandles) : Object.freeze([defaultHandle]);
  const ownerGroup = config.OWNER_GROUP?.trim();
  const admins = csv(config.OIDC_ADMIN_GROUPS);
  const allowed = csv(config.OIDC_ALLOWED_GROUPS);
  const governanceActive = admins.length > 0 || allowed.length > 0;
  const reDerive = governanceActive || TRUTHY.has(config.RE_DERIVE_ROLE_ON_LOGIN?.trim().toLowerCase() ?? "");
  const reservedKeys = Object.freeze([...handles, defaultHandle].map(handleKey));

  function isOwnerGroupMember(groups: readonly string[]): boolean {
    return ownerGroup !== undefined && ownerGroup.length > 0 && groups.includes(ownerGroup);
  }

  function isOwnerByPolicy(handle: Handle, groups: readonly string[]): boolean {
    return isOwnerGroupMember(groups) || handles.includes(handle);
  }

  function roleFor(ownerByPolicy: boolean, groups: readonly string[]): UserRole {
    if (ownerByPolicy) {
      return "owner";
    }
    return intersects(groups, admins) ? "admin" : "user";
  }

  function identityAccess(ownerByPolicy: boolean, groups: readonly string[]): IdentityAccess {
    // Owner policy and admin-group membership bypass the login gate; a role literal never grants that bypass.
    const privileged = ownerByPolicy || intersects(groups, admins);
    if (!(privileged || allowed.length === 0 || intersects(groups, allowed))) {
      return { outcome: "deny" };
    }
    return { outcome: "allow", role: roleFor(ownerByPolicy, groups) };
  }

  return Object.freeze({
    ownerHandles: (): readonly string[] => handles,
    // A group can prove an owner claim, but cannot identify the handle boot re-seeds through.
    isOwnerSeedHandle: (handle: Handle): boolean => handles.includes(handle),
    isReservedSignupHandle: (handle: Handle): boolean => reservedKeys.includes(handleKey(handle)),
    isOwnerByPolicy,
    isOwnerGroupMember,
    determineRole: (handle: Handle, groups: readonly string[]): UserRole => roleFor(isOwnerByPolicy(handle, groups), groups),
    deriveIdentityAccess: (handle: Handle, groups: readonly string[]): IdentityAccess => identityAccess(isOwnerByPolicy(handle, groups), groups),
    identityAccess,
    groupRoleGovernanceActive: (): boolean => governanceActive,
    // The bootstrap owner's exemption remains the provisioning verb's row-identity decision (D65).
    reDeriveRoleOnLogin: (): boolean => reDerive,
  });
}

/** Bind-once subject comparison shared by SSO provisioning and the admin link capability. A null subject
 *  claims nothing; forward-header identities may legitimately have none (D258). */
export function isSubjectMismatch(existingExternalId: ExternalId | null, incomingExternalId: ExternalId | null): boolean {
  return incomingExternalId !== null && existingExternalId !== null && existingExternalId !== incomingExternalId;
}
