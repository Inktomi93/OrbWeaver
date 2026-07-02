// verb: setRole — OWNER-ONLY (requireOwner) + the owner-immutability guard (D17). The load-bearing
// invariants: a delegated admin is REFUSED (owner-only); the owner can't be demoted (both the friendly
// pre-check AND the atomic WHERE-clause); the owner role can't be granted; demoting the LAST delegated
// admin succeeds (no last-admin guard — the owner is always admin-capable). Every success audits.

import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAgent, seedUser } from "../_support.ts";

describe("setRole", () => {
  test("the owner promotes a user to admin (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: "t" });

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
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    await expect(
      svc.setRole({ principal: principal(admin, "admin"), userId: target, role: "admin" }),
    ).rejects.toThrow(DomainForbiddenError);
  });

  test("granting the owner role is refused (cannot_grant_owner)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    await expect(
      svc.setRole({ principal: principal(owner, "owner"), userId: target, role: "owner" }),
    ).rejects.toMatchObject({ code: "cannot_grant_owner" });
  });

  test("the owner can't be demoted, and the owner row is unchanged", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    await expect(
      svc.setRole({ principal: principal(owner, "owner"), userId: owner, role: "user" }),
    ).rejects.toMatchObject({ code: "cannot_modify_owner" });
    const rows = await db.select().from(users).where(eq(users.id, owner));
    expect(rows[0]?.role).toBe("owner");
  });

  test("demoting the LAST delegated admin succeeds (no last-admin guard, D17)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    const onlyAdmin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
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
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    await expect(
      svc.setRole({
        principal: principal(owner, "owner"),
        userId: castId<UserId>("user_ghost"),
        role: "admin",
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("REFUSES an agent target — cannot_modify_agent, no write, no audit (D60)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    const agentId = await seedAgent(db, owner);
    await expect(
      svc.setRole({ principal: principal(owner, "owner"), userId: agentId, role: "admin" }),
    ).rejects.toThrow(DomainOperationError);
    const row = (await db.select().from(users).where(eq(users.id, agentId)))[0];
    expect(row?.role).toBe("user");
    expect(h.audits).toHaveLength(0);
  });
});
