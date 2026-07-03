import process from "node:process";
import type { UserRole } from "@orb/contracts/identity";
import { env } from "#foundation/env";

// domain/sessions/substrate/role-policy — the ONE access-control decision the app owns: who is the
// `owner` (D17). Pure derivation policy + the SANCTIONED call-time `process.env` trio:
// `OWNER_HANDLES` / `OWNER_GROUP` / `RE_DERIVE_ROLE_ON_LOGIN` are read at CALL
// time — NOT via the frozen parsed `env` — so per-test `vi.stubEnv` drives the role matrix. This is the
// documented EXCEPTION to "foundation/env is the only process.env reader," isolated to THIS ONE file (the
// biome `noProcessEnv` override + the `sole-env-reader` gate allowlist scope the exception to exactly
// these three vars here). The deploy-pinned vars (AUTH_MODE, SESSION_SECRET, …) still flow through `env`.
//
// `OWNER_HANDLES`/`OWNER_GROUP` ARE declared in `foundation/env` (schema/docs = source of truth);
// `RE_DERIVE_ROLE_ON_LOGIN` is deliberately OFF parsed-env (env notes this) — it is a per-test toggle the
// frozen object cannot give. `DEFAULT_USER_HANDLE` (the single-user owner) is read from frozen `env`.

// The three var names are inlined at each `process.env["…"]` read (NOT hoisted to a const) so the
// `sole-env-reader` gate can statically verify the EXACT allowlisted keys at the access site — exactly the
// `process.env["VITEST"]` literal style `foundation/env` uses.
const HANDLE_SEPARATOR = ",";
// Tolerant truthy set for RE_DERIVE_ROLE_ON_LOGIN — the pre-fix exact `=== "true"` silently disabled
// group-driven revocation on "True"/"1"/"yes".
const TRUTHY = new Set(["true", "1", "yes"]);

/**
 * The owner-handle allowlist: `OWNER_HANDLES` (comma-list) when set, else just `[DEFAULT_USER_HANDLE]`
 * (the single-user owner). The SAME predicate `determineRole` and the single-user/fallback path agree on.
 */
export function ownerHandles(): string[] {
  const raw = process.env["OWNER_HANDLES"];
  if (raw !== undefined && raw.trim().length > 0) {
    return raw
      .split(HANDLE_SEPARATOR)
      .map((handle) => handle.trim())
      .filter((handle) => handle.length > 0);
  }
  return [env.DEFAULT_USER_HANDLE];
}

/**
 * The one access-control decision: `owner` iff the identity is in `OWNER_GROUP` OR its handle ∈
 * `OWNER_HANDLES` (group preferred, mirroring the stack's role-mapping convention); else `user`. **`admin`
 * is NEVER derived from env — it is GRANTED** by the owner via `setRole` (D17). The returned member is a
 * subset of `UserRole` (the one importable union — no inline re-spell).
 */
export function determineRole(handle: string, groups: string[]): UserRole {
  const ownerGroup = process.env["OWNER_GROUP"];
  if (ownerGroup !== undefined && ownerGroup.length > 0 && groups.includes(ownerGroup)) {
    return "owner";
  }
  if (ownerHandles().includes(handle)) {
    return "owner";
  }
  return "user";
}

/**
 * Whether a `provisionIdentity` UPDATE should RE-DERIVE `role` from `OWNER_*` (default OFF — "removal does
 * NOT auto-demote"; a manual `setRole` grant survives the user's next login). Tolerant parse: true on
 * `true`/`1`/`yes` (case-insensitive).
 */
export function reDeriveRoleOnLogin(): boolean {
  const raw = process.env["RE_DERIVE_ROLE_ON_LOGIN"]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}
