import type { Principal, ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import { USER_ROLES, userRoleSchema } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";

// D17 PIN: the global-role axis is EXACTLY [owner, admin, user] — the `owner` member is the new one
// (was neo's 2-member admin|user). A drift here is the whole point of this node's existence.
test("USER_ROLES is exactly the 3-member D17 axis [owner, admin, user]", () => {
  expect(USER_ROLES).toEqual(["owner", "admin", "user"]);
  expect(userRoleSchema.options).toEqual(USER_ROLES);
});

// Exhaustiveness: a `Record<UserRole, …>` fails `tsc` if a member is added/removed, so the runtime
// assert below is backed by a compile-time guard (no inline role-union re-spelling anywhere else).
const ROLE_SEEN: Record<UserRole, true> = { owner: true, admin: true, user: true };
test("UserRole has no member beyond the tuple (exhaustive over owner|admin|user)", () => {
  expect(Object.keys(ROLE_SEEN).sort()).toEqual([...USER_ROLES].sort());
});

test("userRoleSchema round-trips every valid role and rejects non-members", () => {
  for (const role of USER_ROLES) {
    expect(userRoleSchema.parse(role)).toBe(role);
  }
  // The neo-era and adjacent-axis values are NOT roles: a 2-member echo, a per-chat resource role,
  // an agent-ish label, the empty string.
  expect(userRoleSchema.safeParse("superadmin").success).toBe(false);
  expect(userRoleSchema.safeParse("host").success).toBe(false);
  expect(userRoleSchema.safeParse("guest").success).toBe(false);
  expect(userRoleSchema.safeParse("").success).toBe(false);
});

// Sample branded values built at the untyped seam (castId is the sanctioned cast) — no pasted secrets.
const SAMPLE_USER_ID = castId<UserId>("user-alice");
const SAMPLE_HANDLE = castId<Handle>("alice");
const SAMPLE_EXTERNAL_ID = castId<ExternalId>("authentik-sub-alice");

test("Principal pins the D19 shape: userId+role+handle+externalId+via, no callerUserId/isOwner/groups", () => {
  const principal: Principal = {
    userId: SAMPLE_USER_ID,
    role: "owner",
    handle: SAMPLE_HANDLE,
    externalId: SAMPLE_EXTERNAL_ID,
    via: "fallback",
  };
  expect(Object.keys(principal).sort()).toEqual(
    ["externalId", "handle", "role", "userId", "via"].sort(),
  );
  // D19: the caller is `Principal.userId` — there is NO `callerUserId`, NO `isOwner` (owner⊇admin lives
  // in the can() seam), and NO `groups` (role is the sole carried authz axis — ledger §2).
  expect("callerUserId" in principal).toBe(false);
  expect("isOwner" in principal).toBe(false);
  expect("groups" in principal).toBe(false);
  // owner-fallback path keys on handle, so externalId MAY be null on a real Principal.
  const fallbackOwner: Principal = {
    userId: SAMPLE_USER_ID,
    role: "owner",
    handle: SAMPLE_HANDLE,
    externalId: null,
    via: "fallback",
  };
  expect(fallbackOwner.externalId).toBeNull();
});

test("ResolvedIdentity is the pre-row shape and carries NO userId (invariant #3)", () => {
  const resolved: ResolvedIdentity = {
    externalId: SAMPLE_EXTERNAL_ID,
    handle: SAMPLE_HANDLE,
    groups: ["platform-owners"],
  };
  expect(Object.keys(resolved).sort()).toEqual(["externalId", "groups", "handle"].sort());
  expect("userId" in resolved).toBe(false);
  // The single-user / owner-fallback path resolves with a null externalId (keys on handle).
  const singleUser: ResolvedIdentity = { externalId: null, handle: SAMPLE_HANDLE, groups: [] };
  expect(singleUser.externalId).toBeNull();
});
