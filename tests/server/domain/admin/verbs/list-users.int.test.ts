// verb: listUsers — gated read of the user table; the view must never carry a secret column.

import { DomainForbiddenError } from "@orb/kit/errors";
import { createAdminService } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAgent, seedUser } from "../_support.ts";

describe("listUsers", () => {
  test("owner and admin can list; the view omits passwordHash", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    await seedUser(db, { id: "user_a", role: "user", handle: "a", passwordHash: "scrypt$x$y" });

    const asOwner = await svc.listUsers({ principal: principal(owner, "owner") });
    expect(asOwner.length).toBe(2);
    for (const row of asOwner) {
      expect(Object.keys(row)).not.toContain("passwordHash");
    }

    const admin = await seedUser(db, { id: "user_admin", role: "admin", handle: "adm" });
    const asAdmin = await svc.listUsers({ principal: principal(admin, "admin") });
    expect(asAdmin.length).toBe(3);
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: "u" });
    await expect(svc.listUsers({ principal: principal(u, "user") })).rejects.toThrow(
      DomainForbiddenError,
    );
  });

  test("shows agents by default; the kind axis filters + ownerHandle names the owner (D60)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    const agentId = await seedAgent(db, owner);
    const all = await svc.listUsers({ principal: principal(owner, "owner") });
    expect(all).toHaveLength(2);
    const agents = await svc.listUsers({ principal: principal(owner, "owner"), kind: "agent" });
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe(agentId);
    expect(agents[0]?.ownerHandle).toBe("owner");
    const humans = await svc.listUsers({ principal: principal(owner, "owner"), kind: "human" });
    expect(humans.map((u) => u.id)).toEqual([owner]);
    expect(humans[0]?.ownerHandle).toBeNull();
  });
});
