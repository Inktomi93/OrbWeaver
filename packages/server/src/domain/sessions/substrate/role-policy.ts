import process from "node:process";
import type { UserRole } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { env } from "#foundation/env";
import type { IdentityAccess } from "../contract/results.ts";

// The app's IdP-group → role governance: pure derivation policy + the sanctioned call-time `process.env`
// reads (OWNER_HANDLES/OWNER_GROUP/OIDC_ADMIN_GROUPS/OIDC_ALLOWED_GROUPS/RE_DERIVE_ROLE_ON_LOGIN), read at
// call time (not via the frozen `env`) so per-test `vi.stubEnv` drives the role/access matrix. Documented
// exception to "foundation/env is the only process.env reader," scoped to this file's biome override.
//
// Roles: OWNER (OWNER_GROUP membership or handle in OWNER_HANDLES; immutable bootstrap singleton, exempt
// from the allowed-groups gate). ADMIN (membership in any OIDC_ADMIN_GROUPS group; implicitly allowed to log
// in). USER (passes the allowed-groups gate, no admin group). DENY (OIDC_ALLOWED_GROUPS set and the identity
// is in none of those groups and not owner/admin — login refused).

// The var names are inlined at each `process.env["…"]` read (NOT hoisted to a const) so the
// `sole-env-reader` gate can statically verify the EXACT allowlisted keys at the access site — exactly the
// `process.env["VITEST"]` literal style `foundation/env` uses.
const CSV_SEPARATOR = ",";
// Tolerant truthy set for RE_DERIVE_ROLE_ON_LOGIN — the pre-fix exact `=== "true"` silently disabled
// group-driven revocation on "True"/"1"/"yes".
const TRUTHY = new Set(["true", "1", "yes"]);

/** Parse a comma-list env value into trimmed, non-empty entries. */
function csv(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(CSV_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Non-empty intersection test (small lists — the linear scan is fine). */
function intersects(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

/** The IdP groups that grant `admin` on login (`OIDC_ADMIN_GROUPS`, CSV). Empty ⇒ no group grants admin. */
function adminGroups(): string[] {
  return csv(process.env["OIDC_ADMIN_GROUPS"]);
}

/** The login-access gate groups (`OIDC_ALLOWED_GROUPS`, CSV). Empty ⇒ the gate is OFF (all authenticated
 *  users allowed — backward-compat). */
function allowedGroups(): string[] {
  return csv(process.env["OIDC_ALLOWED_GROUPS"]);
}

/**
 * The owner-handle allowlist: `OWNER_HANDLES` (comma-list) when set, else just `[DEFAULT_USER_HANDLE]`
 * (the single-user owner). The SAME predicate `determineRole` and the single-user/fallback path agree on.
 */
export function ownerHandles(): string[] {
  const raw = process.env["OWNER_HANDLES"];
  if (raw !== undefined && raw.trim().length > 0) {
    return csv(raw);
  }
  return [env.DEFAULT_USER_HANDLE];
}

/** `owner` iff the identity is in `OWNER_GROUP` OR its handle ∈ `OWNER_HANDLES` (group preferred). */
function isOwnerByPolicy(handle: Handle, groups: string[]): boolean {
  const ownerGroup = process.env["OWNER_GROUP"];
  if (ownerGroup !== undefined && ownerGroup.length > 0 && groups.includes(ownerGroup)) {
    return true;
  }
  return ownerHandles().includes(handle);
}

/**
 * The PURE role derivation (no login gate): `owner` (owner policy) → `admin` (any `OIDC_ADMIN_GROUPS`
 * group) → `user`. The owner-fallback JIT path (`ensureUser`) uses this directly with empty groups (⇒
 * owner for the owner handle, else user). SSO login uses {@link deriveIdentityAccess}, which layers the
 * allowed-groups gate on top. The returned member is a subset of `UserRole` (no inline re-spell).
 */
export function determineRole(handle: Handle, groups: string[]): UserRole {
  if (isOwnerByPolicy(handle, groups)) {
    return "owner";
  }
  if (intersects(groups, adminGroups())) {
    return "admin";
  }
  return "user";
}

/** Whether the identity passes the `OIDC_ALLOWED_GROUPS` gate. Unset ⇒ pass (backward-compat). */
function passesAllowedGate(groups: string[]): boolean {
  const allowed = allowedGroups();
  if (allowed.length === 0) {
    return true;
  }
  return intersects(groups, allowed);
}

/** The SSO login access + role decision. `deny` when `OIDC_ALLOWED_GROUPS` is set and the identity is in
 *  none of those groups (and is not owner/admin — owner is exempt, admin is implicitly allowed, OpenWebUI
 *  parity). Fail-closed by construction: an empty/unparseable groups list with the gate set never passes. */
export function deriveIdentityAccess(handle: Handle, groups: string[]): IdentityAccess {
  const derivedRole = determineRole(handle, groups);
  // Owner/admin bypass the allowed-groups gate (owner is exempt; admin — an OIDC_ADMIN_GROUPS member — is
  // implicitly allowed, OpenWebUI parity). The bypass is the GROUP predicate, NOT a role-literal comparison
  // (the owner ⊇ admin lattice lives only in `can()` — the `owner-role-split` gate forbids comparing here).
  const privileged = isOwnerByPolicy(handle, groups) || intersects(groups, adminGroups());
  if (!(privileged || passesAllowedGate(groups))) {
    return { outcome: "deny" };
  }
  return { outcome: "allow", role: derivedRole };
}

/**
 * Whether group-driven role governance is ACTIVE — the operator opted in by setting `OIDC_ADMIN_GROUPS`
 * or `OIDC_ALLOWED_GROUPS`. When active, admin/user roles RE-DERIVE from groups on every login (an
 * authentik group change takes effect next login). When inactive (neither set), role governance is the
 * legacy manual-`setRole` posture and a login preserves the stored role unless `RE_DERIVE_ROLE_ON_LOGIN`.
 * The OWNER role is NEVER re-derived either way (the immutable bootstrap singleton — enforced at the verb).
 */
export function groupRoleGovernanceActive(): boolean {
  return adminGroups().length > 0 || allowedGroups().length > 0;
}

/**
 * Whether a `provisionIdentity` UPDATE should RE-DERIVE the (non-owner) `role`. TRUE when group governance
 * is active OR the legacy `RE_DERIVE_ROLE_ON_LOGIN` flag is set (default OFF — "removal does NOT
 * auto-demote"; a manual `setRole` grant survives the user's next login). Tolerant flag parse: true on
 * `true`/`1`/`yes` (case-insensitive).
 */
export function reDeriveRoleOnLogin(): boolean {
  if (groupRoleGovernanceActive()) {
    return true;
  }
  const raw = process.env["RE_DERIVE_ROLE_ON_LOGIN"]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}
