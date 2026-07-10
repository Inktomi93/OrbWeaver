import { afterEach, describe, vi } from "vitest";
import {
  deriveIdentityAccess,
  determineRole,
  groupRoleGovernanceActive,
  ownerHandles,
  reDeriveRoleOnLogin,
} from "../../../../../packages/server/src/domain/sessions/substrate/role-policy";
import { expect, test } from "../../../../support/fixtures";

// The group→role governance matrix (D17; owner-confirmed). The vars are read at CALL time from process.env
// (the sanctioned exception), so `vi.stubEnv` drives every case. The model, mapped onto orb's owner|admin|
// user enum (NOT a new group subsystem): OWNER_GROUP/OWNER_HANDLES → owner (the immutable singleton);
// OIDC_ADMIN_GROUPS → admin (the owner granting admin THROUGH the IdP); OIDC_ALLOWED_GROUPS → the login
// access gate (in none ⇒ deny). Owner is exempt from the gate; admins are implicitly allowed.

const OWNER_HANDLES = "OWNER_HANDLES";
const OWNER_GROUP = "OWNER_GROUP";
const ADMIN_GROUPS = "OIDC_ADMIN_GROUPS";
const ALLOWED_GROUPS = "OIDC_ALLOWED_GROUPS";
const RE_DERIVE = "RE_DERIVE_ROLE_ON_LOGIN";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("determineRole — owner", () => {
  test("owner iff the handle is in OWNER_HANDLES", () => {
    vi.stubEnv(OWNER_HANDLES, "alice,bob");
    vi.stubEnv(OWNER_GROUP, undefined);
    expect(determineRole("alice", [])).toBe("owner");
    expect(determineRole("bob", [])).toBe("owner");
    expect(determineRole("carol", [])).toBe("user");
  });

  test("owner iff the identity is in OWNER_GROUP (group preferred)", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(OWNER_GROUP, "owners");
    expect(determineRole("carol", ["owners"])).toBe("owner");
    expect(determineRole("carol", ["other"])).toBe("user");
  });

  test("an empty/whitespace OWNER_GROUP never grants owner", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(OWNER_GROUP, "");
    expect(determineRole("dave", [""])).toBe("user");
  });
});

describe("determineRole derives admin from the configured admin groups (owner-confirmed)", () => {
  test("membership in an OIDC_ADMIN_GROUPS group derives admin", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(ADMIN_GROUPS, "Orb Admins,staff-admins");
    expect(determineRole("dave", ["Orb Admins"])).toBe("admin");
    expect(determineRole("dave", ["staff-admins", "eng"])).toBe("admin");
    expect(determineRole("dave", ["eng"])).toBe("user");
  });

  test("owner policy wins over admin-group membership (owner ⊇ admin)", () => {
    vi.stubEnv(OWNER_GROUP, "owners");
    vi.stubEnv(ADMIN_GROUPS, "admins");
    expect(determineRole("alice", ["owners", "admins"])).toBe("owner");
  });

  test("unset OIDC_ADMIN_GROUPS ⇒ no group grants admin (setRole stays the only source)", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(ADMIN_GROUPS, undefined);
    expect(determineRole("dave", ["admins", "Orb Admins"])).toBe("user");
  });
});

describe("deriveIdentityAccess — the OIDC_ALLOWED_GROUPS login gate", () => {
  test("gate UNSET ⇒ every authenticated identity is allowed (backward-compat)", () => {
    vi.stubEnv(ALLOWED_GROUPS, undefined);
    expect(deriveIdentityAccess("dave", [])).toStrictEqual({ outcome: "allow", role: "user" });
    expect(deriveIdentityAccess("dave", ["random"])).toStrictEqual({
      outcome: "allow",
      role: "user",
    });
  });

  test("gate SET + identity in an allowed group ⇒ allow (role user)", () => {
    vi.stubEnv(ALLOWED_GROUPS, "Orb Users,Orb Admins");
    expect(deriveIdentityAccess("dave", ["Orb Users"])).toStrictEqual({
      outcome: "allow",
      role: "user",
    });
  });

  test("gate SET + identity in NONE of the allowed groups ⇒ DENY (fail-closed)", () => {
    vi.stubEnv(ALLOWED_GROUPS, "Orb Users");
    expect(deriveIdentityAccess("mallory", ["some-other-group"])).toStrictEqual({
      outcome: "deny",
    });
    // Empty groups with the gate set is the classic fail-closed case.
    expect(deriveIdentityAccess("mallory", [])).toStrictEqual({ outcome: "deny" });
  });

  test("admin is IMPLICITLY allowed — an admin-group member passes even if not in an allowed group", () => {
    vi.stubEnv(ALLOWED_GROUPS, "Orb Users");
    vi.stubEnv(ADMIN_GROUPS, "Orb Admins");
    expect(deriveIdentityAccess("dave", ["Orb Admins"])).toStrictEqual({
      outcome: "allow",
      role: "admin",
    });
  });

  test("owner is EXEMPT from the gate — never denied even if in no allowed group", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(ALLOWED_GROUPS, "Orb Users");
    // alice matches OWNER_HANDLES and is in NONE of the allowed groups → still owner, still allowed.
    expect(deriveIdentityAccess("alice", [])).toStrictEqual({ outcome: "allow", role: "owner" });
  });
});

describe("groupRoleGovernanceActive", () => {
  test("false when neither OIDC_ADMIN_GROUPS nor OIDC_ALLOWED_GROUPS is set", () => {
    vi.stubEnv(ADMIN_GROUPS, undefined);
    vi.stubEnv(ALLOWED_GROUPS, undefined);
    expect(groupRoleGovernanceActive()).toBe(false);
  });

  test("true when either is set (activates group re-derivation)", () => {
    vi.stubEnv(ADMIN_GROUPS, "Orb Admins");
    expect(groupRoleGovernanceActive()).toBe(true);
  });
});

describe("ownerHandles", () => {
  test("parses the OWNER_HANDLES comma-list, trimming + dropping empties", () => {
    vi.stubEnv(OWNER_HANDLES, " alice , , bob ,");
    expect(ownerHandles()).toStrictEqual(["alice", "bob"]);
  });

  test("falls back to the single DEFAULT_USER_HANDLE when OWNER_HANDLES is unset", () => {
    vi.stubEnv(OWNER_HANDLES, undefined);
    const handles = ownerHandles();
    expect(handles).toHaveLength(1);
    expect(determineRole(handles[0] ?? "", [])).toBe("owner");
  });
});

describe("the re-derive-role-on-login flag", () => {
  test.each(["true", "TRUE", "True", "1", "yes", " yes "])("flag '%s' → true", (raw) => {
    vi.stubEnv(RE_DERIVE, raw);
    expect(reDeriveRoleOnLogin()).toBe(true);
  });

  test.each(["false", "no", "0", "", "nope"])("flag '%s' → false (no group governance)", (raw) => {
    vi.stubEnv(RE_DERIVE, raw);
    expect(reDeriveRoleOnLogin()).toBe(false);
  });

  test("unset → false (default OFF — removal does NOT auto-demote)", () => {
    vi.stubEnv(RE_DERIVE, undefined);
    expect(reDeriveRoleOnLogin()).toBe(false);
  });

  test("group governance active ⇒ re-derive ON regardless of the legacy flag", () => {
    vi.stubEnv(RE_DERIVE, undefined);
    vi.stubEnv(ALLOWED_GROUPS, "Orb Users");
    expect(reDeriveRoleOnLogin()).toBe(true);
  });
});
