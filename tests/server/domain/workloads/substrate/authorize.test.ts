// substrate/authorize — the F3 per-user authorization predicates. Pure. Pins: the leak-free
// visible/owner-filter rules, and the mode-support gate's asymmetry (assets-gc is bulk-only).

import type { Principal } from "@orb/contracts/identity";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { assertKindSupportsMode, isVisibleToCaller, resolveListOwnerFilter } from "../../../../../packages/server/src/domain/workloads/substrate/authorize.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER: UserId = castId("user_owner");
const OTHER: UserId = castId("user_other");
const caller = (userId: UserId): Principal => ({ userId, role: "user", handle: castId("h"), externalId: null, via: "header" });
const isAdmin = (p: Principal): boolean => p.role === "admin";

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
    expect(isVisibleToCaller(isAdmin, caller(OTHER), OWNER)).toBe(false); // non-admin, different owner
    const admin: Principal = { ...caller(OTHER), role: "admin" };
    expect(isVisibleToCaller(isAdmin, admin, OWNER)).toBe(true);
  });

  test("a non-admin sees only its own rows, never a null-owned system row", () => {
    expect(isVisibleToCaller(isAdmin, caller(OWNER), OWNER)).toBe(true);
    expect(isVisibleToCaller(isAdmin, caller(OWNER), null)).toBe(false);
    expect(isVisibleToCaller(isAdmin, caller(OWNER), OTHER)).toBe(false);
  });
});

describe("resolveListOwnerFilter", () => {
  test("a non-admin caller is FORCED to its own userId regardless of the requested filter", () => {
    expect(resolveListOwnerFilter(isAdmin, caller(OWNER), OTHER)).toBe(OWNER);
    expect(resolveListOwnerFilter(isAdmin, caller(OWNER), undefined)).toBe(OWNER);
  });

  test("a null (system) caller keeps the requested filter", () => {
    expect(resolveListOwnerFilter(isAdmin, null, OTHER)).toBe(OTHER);
    expect(resolveListOwnerFilter(isAdmin, null, undefined)).toBeUndefined();
  });

  test("an admin caller keeps the requested filter (deployment-wide view when undefined)", () => {
    const admin: Principal = { ...caller(OWNER), role: "admin" };
    expect(resolveListOwnerFilter(isAdmin, admin, undefined)).toBeUndefined();
    expect(resolveListOwnerFilter(isAdmin, admin, OTHER)).toBe(OTHER);
  });
});
