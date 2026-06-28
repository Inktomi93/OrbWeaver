// verb: listUsers — gated read of the user table; the view must never carry a secret column.

import { DomainForbiddenError } from "@orb/kit/errors";
import { createAdminService } from "@orb/server/domain/admin";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

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
});
