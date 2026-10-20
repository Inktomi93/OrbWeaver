// substrate/authorize — the F3 per-user authorization predicates. Pure. Pins: the leak-free
// visible/owner-filter rules, and the mode-support gate's asymmetry (assets-gc is bulk-only).

import type { Principal, UserRole } from "@orb/contracts/identity";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { principal as makePrincipal } from "@orb/testkit/node/factories/principal.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { isAdmin } from "#server/domain/admin/guard.ts";
import { assertKindSupportsMode, isVisibleToCaller, resolveListOwnerFilter } from "#server/domain/workloads/substrate/authorize.ts";

const OWNER: UserId = castId("user_owner");
const OTHER: UserId = castId("user_other");
// The predicates read no rows; each caller resolves from its own row in its own in-memory database.
async function principalAs(userId: UserId, role: UserRole = "user"): Promise<Principal> {
  return await makePrincipal({ db: await freshDb() }, userId, { role });
}
const USER_OWNER = await principalAs(OWNER);
const USER_OTHER = await principalAs(OTHER);
const ADMIN_OWNER = await principalAs(OWNER, "admin");
const ADMIN_OTHER = await principalAs(OTHER, "admin");
const BOX_OWNER_OWNER = await principalAs(OWNER, "owner");
const BOX_OWNER_OTHER = await principalAs(OTHER, "owner");

describe("assertKindSupportsMode", () => {
  test("a kind supporting the mode does not throw", () => {
    expect(() => assertKindSupportsMode("index", "singular")).not.toThrow();
    expect(() => assertKindSupportsMode("index", "bulk")).not.toThrow();
  });

  test("a bulk-only kind (assets-gc) refuses a singular request with a typed unsupported_mode error", () => {
    let thrown: unknown;
    try {
      assertKindSupportsMode("assets-gc", "singular");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainOperationError);
    expect((thrown as DomainOperationError).code).toBe("unsupported_mode");
  });

  test("a bulk-only kind still supports bulk", () => {
    expect(() => assertKindSupportsMode("assets-gc", "bulk")).not.toThrow();
  });
});

describe("isVisibleToCaller", () => {
  test("a null caller (trusted system/scheduler) sees every row", () => {
    expect(isVisibleToCaller(isAdmin, null, OWNER)).toBe(true);
    expect(isVisibleToCaller(isAdmin, null, null)).toBe(true);
  });

  test("an admin sees every owner's row", () => {
    expect(isVisibleToCaller(isAdmin, USER_OTHER, OWNER)).toBe(false); // non-admin, different owner
    const admin = ADMIN_OTHER;
    expect(isVisibleToCaller(isAdmin, admin, OWNER)).toBe(true);
  });

  test("the box owner holds admin authority and sees every owner's row", () => {
    const owner = BOX_OWNER_OTHER;
    expect(isVisibleToCaller(isAdmin, owner, OWNER)).toBe(true);
    expect(isVisibleToCaller(isAdmin, owner, null)).toBe(true);
  });

  test("a non-admin sees only its own rows, never a null-owned system row", () => {
    expect(isVisibleToCaller(isAdmin, USER_OWNER, OWNER)).toBe(true);
    expect(isVisibleToCaller(isAdmin, USER_OWNER, null)).toBe(false);
    expect(isVisibleToCaller(isAdmin, USER_OWNER, OTHER)).toBe(false);
  });
});

describe("resolveListOwnerFilter", () => {
  test("a non-admin caller is FORCED to its own userId regardless of the requested filter", () => {
    expect(resolveListOwnerFilter(isAdmin, USER_OWNER, OTHER)).toBe(OWNER);
    expect(resolveListOwnerFilter(isAdmin, USER_OWNER, undefined)).toBe(OWNER);
  });

  test("a null (system) caller keeps the requested filter", () => {
    expect(resolveListOwnerFilter(isAdmin, null, OTHER)).toBe(OTHER);
    expect(resolveListOwnerFilter(isAdmin, null, undefined)).toBeUndefined();
  });

  test("an admin caller keeps the requested filter (deployment-wide view when undefined)", () => {
    const admin = ADMIN_OWNER;
    expect(resolveListOwnerFilter(isAdmin, admin, undefined)).toBeUndefined();
    expect(resolveListOwnerFilter(isAdmin, admin, OTHER)).toBe(OTHER);
  });

  test("the box owner keeps the requested filter like an admin", () => {
    const owner = BOX_OWNER_OWNER;
    expect(resolveListOwnerFilter(isAdmin, owner, undefined)).toBeUndefined();
    expect(resolveListOwnerFilter(isAdmin, owner, OTHER)).toBe(OTHER);
  });
});
