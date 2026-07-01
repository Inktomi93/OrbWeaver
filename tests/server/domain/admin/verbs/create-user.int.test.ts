// verb: createUser — admin-gated mint of a loginable local human. Validation reasons (invalid_handle,
// weak_password, cannot_grant_owner), the password is hashed (and never surfaces in the view), and a
// duplicate handle is rejected as user_exists.

import { users } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const GOOD_PASSWORD = "correct-horse";

describe("createUser", () => {
  test("an admin mints a user; the password is hashed and absent from the view (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });

    const view = await svc.createUser({
      principal: principal(admin, "admin"),
      handle: "newbie",
      password: GOOD_PASSWORD,
    });
    expect(view.handle).toBe("newbie");
    expect(view.role).toBe("user");
    expect(Object.keys(view)).not.toContain("passwordHash");

    const rows = await db.select().from(users).where(eq(users.id, view.id));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${GOOD_PASSWORD}`);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.createUser");
  });

  test("an empty handle is rejected (invalid_handle)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "   ",
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_handle" });
  });

  test("a short password is rejected (weak_password)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.createUser({ principal: principal(admin, "admin"), handle: "x", password: "short" }),
    ).rejects.toMatchObject({ code: "weak_password" });
  });

  test("minting an owner is refused (cannot_grant_owner)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "x",
        password: GOOD_PASSWORD,
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "cannot_grant_owner" });
  });

  test("a duplicate handle is rejected (user_exists)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await seedUser(db, { id: "user_dup", role: "user", handle: "taken" });
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "taken",
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "user_exists" });
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: "u" });
    await expect(
      svc.createUser({ principal: principal(u, "user"), handle: "x", password: GOOD_PASSWORD }),
    ).rejects.toThrow(DomainForbiddenError);
  });
});
