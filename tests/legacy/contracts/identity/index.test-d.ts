import type { Principal, ResolvedIdentity, UserRole, UserRoleState } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

// `Principal` and `ResolvedIdentity` are plain interfaces with no schema, so their shapes are compile-time contracts.

// D19: the caller is `Principal.userId`. There is no `callerUserId`, no `isOwner` (owner ⊇ admin lives in the
// `can()` seam) and no `groups` (role is the sole carried authz axis). The owner-fallback path keys on handle,
// so `externalId` may be null on a real Principal. The carried role is opaque captured role data: a consumer cannot
// read a role code off the Principal, only the authority and data-projection owners decode it.
test("Principal is userId + role + handle + externalId + via, with no callerUserId, isOwner or groups", () => {
  expectTypeOf<keyof Principal>().toEqualTypeOf<"userId" | "role" | "handle" | "externalId" | "via">();
  expectTypeOf<Principal["userId"]>().toEqualTypeOf<UserId>();
  expectTypeOf<Principal["role"]>().toEqualTypeOf<UserRoleState>();
  expectTypeOf<Principal["role"]>().not.toExtend<UserRole>();
  expectTypeOf<Principal["externalId"]>().toEqualTypeOf<ExternalId | null>();
});

// Invariant #3: the pre-row identity carries no userId and no role. `email` is a mutable attribute, never an
// identity key. The single-user and owner-fallback path resolves with a null externalId (keyed on handle) and no email.
test("ResolvedIdentity is the pre-row shape: externalId + handle + groups + email, with no userId or role", () => {
  expectTypeOf<keyof ResolvedIdentity>().toEqualTypeOf<"externalId" | "handle" | "groups" | "email">();
  expectTypeOf<ResolvedIdentity["handle"]>().toEqualTypeOf<Handle>();
  expectTypeOf<ResolvedIdentity["externalId"]>().toEqualTypeOf<ExternalId | null>();
  expectTypeOf<ResolvedIdentity["email"]>().toEqualTypeOf<string | null>();
});
