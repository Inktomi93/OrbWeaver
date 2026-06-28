import { afterEach, describe, expect, test, vi } from "vitest";
import {
  determineRole,
  ownerHandles,
  reDeriveRoleOnLogin,
} from "../../../../../packages/server/src/domain/sessions/substrate/role-policy";

// The role-derivation policy matrix (invariants #6 + #14). The trio is read at CALL time from process.env
// (the sanctioned exception), so `vi.stubEnv` drives every case. KEY D17 invariant: `owner` is derived
// ONLY from OWNER_GROUP/OWNER_HANDLES; `admin` is NEVER env-derived (it is granted via `setRole`) — so
// `determineRole` returns only `owner` | `user`, which is the "seed-only-mint" discipline for the
// one-owner guarantee (a second owner can't appear except via the OWNER_* config the operator controls).

const OWNER_HANDLES = "OWNER_HANDLES";
const OWNER_GROUP = "OWNER_GROUP";
const RE_DERIVE = "RE_DERIVE_ROLE_ON_LOGIN";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("determineRole", () => {
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

  test("NEVER derives admin from env — only owner|user (D17: admin is granted, not derived)", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(OWNER_GROUP, "owners");
    expect(determineRole("alice", ["owners", "admins"])).toBe("owner");
    expect(determineRole("dave", ["admins"])).toBe("user");
  });

  test("an empty/whitespace OWNER_GROUP never grants owner", () => {
    vi.stubEnv(OWNER_HANDLES, "alice");
    vi.stubEnv(OWNER_GROUP, "");
    expect(determineRole("dave", [""])).toBe("user");
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
    // The lone default handle provisions as owner (the single-user owner) — exactly one owner by config.
    expect(determineRole(handles[0] ?? "", [])).toBe("owner");
  });
});

describe("tolerant boolean parse of the re-derive flag", () => {
  test.each(["true", "TRUE", "True", "1", "yes", " yes "])("'%s' → true", (raw) => {
    vi.stubEnv(RE_DERIVE, raw);
    expect(reDeriveRoleOnLogin()).toBe(true);
  });

  test.each(["false", "no", "0", "", "nope"])("'%s' → false", (raw) => {
    vi.stubEnv(RE_DERIVE, raw);
    expect(reDeriveRoleOnLogin()).toBe(false);
  });

  test("unset → false (default OFF — removal does NOT auto-demote)", () => {
    vi.stubEnv(RE_DERIVE, undefined);
    expect(reDeriveRoleOnLogin()).toBe(false);
  });
});
