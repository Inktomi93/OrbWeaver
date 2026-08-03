// verb: setRole — OWNER-ONLY (requireOwner) + the owner-immutability guard (D17). The load-bearing
// invariants: a delegated admin is REFUSED (owner-only); the owner can't be demoted (both the friendly
// pre-check AND the atomic WHERE-clause); the owner role can't be granted; demoting the LAST delegated
// admin succeeds (no last-admin guard — the owner is always admin-capable). Every success audits.

import { users } from "@orb/db";
import { DomainConflictError, DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAdminCaller, seedUser } from "../_support.ts";

describe("setRole", () => {
  test("the owner promotes a user to admin (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    const updated = await svc.setRole({
      principal: principal(owner, "owner"),
      userId: target,
      role: "admin",
    });
    expect(updated.role).toBe("admin");
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.setRole");
  });

  test("a delegated admin is REFUSED (requireOwner is owner-only)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await expect(svc.setRole({ principal: principal(admin, "admin"), userId: target, role: "admin" })).rejects.toThrow(DomainForbiddenError);
  });

  test("promoting a SECOND user to owner is refused with a typed CONFLICT (D40 single-owner), never a raw DB throw", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    // The pre-check fires BEFORE the write, so the `users_single_owner_unique` partial index is never hit
    // — a friendly `DomainConflictError`, not the raw unique-violation.
    await expect(svc.setRole({ principal: principal(owner, "owner"), userId: target, role: "owner" })).rejects.toThrow(DomainConflictError);
    // The target is untouched — still a plain user.
    const row = (await db.select().from(users).where(eq(users.id, target)))[0];
    expect(row?.role).toBe("user");
  });

  test("setting the EXISTING owner's role to owner is an idempotent no-op success", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const result = await svc.setRole({
      principal: principal(owner, "owner"),
      userId: owner,
      role: "owner",
    });
    expect(result.role).toBe("owner");
    // No write, no audit — the owner row is unchanged.
    expect(h.audits).toHaveLength(0);
    const row = (await db.select().from(users).where(eq(users.id, owner)))[0];
    expect(row?.role).toBe("owner");
  });

  test("the owner can't be demoted, and the owner row is unchanged", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    await expect(svc.setRole({ principal: principal(owner, "owner"), userId: owner, role: "user" })).rejects.toMatchObject({ code: "cannot_modify_owner" });
    const rows = await db.select().from(users).where(eq(users.id, owner));
    expect(rows[0]?.role).toBe("owner");
  });

  test("demoting the LAST delegated admin succeeds (no last-admin guard, D17)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const onlyAdmin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const updated = await svc.setRole({
      principal: principal(owner, "owner"),
      userId: onlyAdmin,
      role: "user",
    });
    expect(updated.role).toBe("user");
  });

  test("a missing target throws DomainNotFoundError", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    await expect(
      svc.setRole({
        principal: principal(owner, "owner"),
        userId: castId<UserId>("user_ghost"),
        role: "admin",
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });
});
