import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy } from "@orb/server/domain/sessions";
import { env } from "@orb/server/foundation/env";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { beforeEach, describe } from "vitest";

// The group→role governance matrix (D17; owner-confirmed), with explicit production policy configuration.
// The model, mapped onto orb's owner|admin|
// user enum (NOT a new group subsystem): OWNER_GROUP/OWNER_HANDLES → owner (the immutable singleton);
// OIDC_ADMIN_GROUPS → admin (the owner granting admin THROUGH the IdP); OIDC_ALLOWED_GROUPS → the login
// access gate (in none ⇒ deny). Owner is exempt from the gate; admins are implicitly allowed.

const OWNER_HANDLES = "OWNER_HANDLES";
const OWNER_GROUP = "OWNER_GROUP";
const ADMIN_GROUPS = "OIDC_ADMIN_GROUPS";
const ALLOWED_GROUPS = "OIDC_ALLOWED_GROUPS";
const RE_DERIVE = "RE_DERIVE_ROLE_ON_LOGIN";

let policyConfig: SessionsRolePolicyConfig;
beforeEach(() => {
  policyConfig = { ...env };
});

describe("determineRole — owner", () => {
  test("owner iff the handle is in OWNER_HANDLES", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice,bob" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: undefined };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("alice"), [])).toBe("owner");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("bob"), [])).toBe("owner");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), [])).toBe("user");
  });

  test("owner iff the identity is in OWNER_GROUP (group preferred)", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "owners" };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["owners"])).toBe("owner");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["other"])).toBe("user");
  });

  test("an empty/whitespace OWNER_GROUP never grants owner", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "" };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), [""])).toBe("user");
    // A whitespace-only value is the same non-configuration as an empty one — and before #1478 item 3 it
    // was compared RAW, so a `"   "` group claim matched it and granted OWNER.
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "   " };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), ["   "])).toBe("user");
  });

  // #1478 item 3 — `csv()` TRIMS every configured group name (OWNER_HANDLES / OIDC_ADMIN_GROUPS /
  // OIDC_ALLOWED_GROUPS) and `normalizeGroups` trims every claimed one, so OWNER_GROUP — the one value
  // compared raw — silently never matched a padded configuration and the owner was never granted.
  test("a PADDED OWNER_GROUP still matches the group claim (the same trim as every sibling var)", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: " owners " };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["owners"])).toBe("owner");
  });

  test("…and the match stays EXACT after the trim — no prefix, suffix or case widening", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: " owner " };
    // A near-miss on either side is a different group, not a sloppy spelling of the same one.
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["owners"])).toBe("user");
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "owners" };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["owner"])).toBe("user");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["OWNERS"])).toBe("user");
    // The INNER space of a real authentik group name survives (OWNER_GROUP="Neo Owners" is live config).
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "  Neo Owners  " };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["Neo Owners"])).toBe("owner");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("carol"), ["NeoOwners"])).toBe("user");
  });
});

describe("determineRole derives admin from the configured admin groups (owner-confirmed)", () => {
  test("membership in an OIDC_ADMIN_GROUPS group derives admin", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: "Orb Admins,staff-admins" };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), ["Orb Admins"])).toBe("admin");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), ["staff-admins", "eng"])).toBe("admin");
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), ["eng"])).toBe("user");
  });

  test("owner policy wins over admin-group membership (owner ⊇ admin)", () => {
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "owners" };
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: "admins" };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("alice"), ["owners", "admins"])).toBe("owner");
  });

  test("unset OIDC_ADMIN_GROUPS ⇒ no group grants admin (setRole stays the only source)", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: undefined };
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("dave"), ["admins", "Orb Admins"])).toBe("user");
  });
});

describe("deriveIdentityAccess — the OIDC_ALLOWED_GROUPS login gate", () => {
  test("gate UNSET ⇒ every authenticated identity is allowed (backward-compat)", () => {
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: undefined };
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("dave"), [])).toStrictEqual({ outcome: "allow", role: "user" });
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("dave"), ["random"])).toStrictEqual({
      outcome: "allow",
      role: "user",
    });
  });

  test("gate SET + identity in an allowed group ⇒ allow (role user)", () => {
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: "Orb Users,Orb Admins" };
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("dave"), ["Orb Users"])).toStrictEqual({
      outcome: "allow",
      role: "user",
    });
  });

  test("gate SET + identity in NONE of the allowed groups ⇒ DENY (fail-closed)", () => {
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: "Orb Users" };
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("mallory"), ["some-other-group"])).toStrictEqual({
      outcome: "deny",
    });
    // Empty groups with the gate set is the classic fail-closed case.
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("mallory"), [])).toStrictEqual({ outcome: "deny" });
  });

  test("admin is IMPLICITLY allowed — an admin-group member passes even if not in an allowed group", () => {
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: "Orb Users" };
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: "Orb Admins" };
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("dave"), ["Orb Admins"])).toStrictEqual({
      outcome: "allow",
      role: "admin",
    });
  });

  test("owner is EXEMPT from the gate — never denied even if in no allowed group", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "alice" };
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: "Orb Users" };
    // alice matches OWNER_HANDLES and is in NONE of the allowed groups → still owner, still allowed.
    expect(createSessionsRolePolicy(policyConfig).deriveIdentityAccess(castId<Handle>("alice"), [])).toStrictEqual({ outcome: "allow", role: "owner" });
  });
});

describe("groupRoleGovernanceActive", () => {
  test("false when neither OIDC_ADMIN_GROUPS nor OIDC_ALLOWED_GROUPS is set", () => {
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: undefined };
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: undefined };
    expect(createSessionsRolePolicy(policyConfig).groupRoleGovernanceActive()).toBe(false);
  });

  test("true when either is set (activates group re-derivation)", () => {
    policyConfig = { ...policyConfig, [ADMIN_GROUPS]: "Orb Admins" };
    expect(createSessionsRolePolicy(policyConfig).groupRoleGovernanceActive()).toBe(true);
  });
});

describe("ownerHandles", () => {
  test("parses the OWNER_HANDLES comma-list, trimming + dropping empties", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: " alice , , bob ," };
    expect(createSessionsRolePolicy(policyConfig).ownerHandles()).toStrictEqual(["alice", "bob"]);
  });

  test("falls back to the single DEFAULT_USER_HANDLE when OWNER_HANDLES is unset", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: undefined };
    const handles = createSessionsRolePolicy(policyConfig).ownerHandles();
    expect(handles).toHaveLength(1);
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>(handles[0] ?? ""), [])).toBe("owner");
  });
});

// `isOwnerSeedHandle` answers a DIFFERENT question from `determineRole`/`isOwnerByPolicy`: not "is this
// identity the owner" (which a GROUP can answer) but "is this ROW's handle the key boot re-seeds through".
// `provisionIdentity` asks it before renaming the owner row, so the group arm must NOT leak into it.
describe("isOwnerSeedHandle — the boot RE-SEED key (handle-only, never group-derived)", () => {
  test("true only for a handle in OWNER_HANDLES", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: " alice , bob " };
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>("alice"))).toBe(true);
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>("bob"))).toBe(true);
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>("carol"))).toBe(false);
  });

  test("OWNER_GROUP never makes a handle a seed key (an owner-by-GROUP handle is still renameable)", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: "owner" };
    policyConfig = { ...policyConfig, [OWNER_GROUP]: "owners" };
    // `determineRole` calls alex the owner via the group; his HANDLE is still not the re-seed key.
    expect(createSessionsRolePolicy(policyConfig).determineRole(castId<Handle>("alex"), ["owners"])).toBe("owner");
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>("alex"))).toBe(false);
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>("owner"))).toBe(true);
  });

  test("unset OWNER_HANDLES ⇒ the DEFAULT_USER_HANDLE fallback IS the seed key (what boot resolves)", () => {
    policyConfig = { ...policyConfig, [OWNER_HANDLES]: undefined };
    const [fallback] = createSessionsRolePolicy(policyConfig).ownerHandles();
    expect(createSessionsRolePolicy(policyConfig).isOwnerSeedHandle(castId<Handle>(fallback ?? ""))).toBe(true);
  });
});

describe("the re-derive-role-on-login flag", () => {
  test.each(["true", "TRUE", "True", "1", "yes", " yes "])("flag '%s' → true", (raw) => {
    policyConfig = { ...policyConfig, [RE_DERIVE]: raw };
    expect(createSessionsRolePolicy(policyConfig).reDeriveRoleOnLogin()).toBe(true);
  });

  test.each(["false", "no", "0", "", "nope"])("flag '%s' → false (no group governance)", (raw) => {
    policyConfig = { ...policyConfig, [RE_DERIVE]: raw };
    expect(createSessionsRolePolicy(policyConfig).reDeriveRoleOnLogin()).toBe(false);
  });

  test("unset → false (default OFF — removal does NOT auto-demote)", () => {
    policyConfig = { ...policyConfig, [RE_DERIVE]: undefined };
    expect(createSessionsRolePolicy(policyConfig).reDeriveRoleOnLogin()).toBe(false);
  });

  test("group governance active ⇒ re-derive ON regardless of the legacy flag", () => {
    policyConfig = { ...policyConfig, [RE_DERIVE]: undefined };
    policyConfig = { ...policyConfig, [ALLOWED_GROUPS]: "Orb Users" };
    expect(createSessionsRolePolicy(policyConfig).reDeriveRoleOnLogin()).toBe(true);
  });
});
