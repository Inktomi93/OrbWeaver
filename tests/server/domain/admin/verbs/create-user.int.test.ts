// verb: createUser — admin-gated mint of a loginable local human. Validation reasons (invalid_handle,
// weak_password, cannot_grant_owner), the password is hashed (and never surfaces in the view), and a
// duplicate handle is rejected as user_exists.

import { users } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAdminCaller, seedUser } from "../_support.ts";

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
    const { svc, admin } = await seedAdminCaller(db);
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "   ",
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_handle" });
  });

  test("a reserved __agent__ handle is rejected (invalid_handle) — the namespace belt; nothing written", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    // Gate-present: a deterministic buddy handle is refused with the exact code (a normal handle still
    // creates — the positive above). Without the belt this INSERTs a human squatting the buddy namespace,
    // DoS-ing that owner's future mint (doc 06 §1).
    const reserved = "__agent__buddy__user_owner";
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: reserved,
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_handle" });
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>(reserved)));
    expect(rows).toHaveLength(0);
  });

  test("a short password is rejected (weak_password)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: "x", password: "short" })).rejects.toMatchObject({ code: "weak_password" });
  });

  test("even the OWNER cannot mint a second owner (cannot_grant_owner — the single-owner invariant)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    // The owner passes the authority gate (requireOwner) but is still refused at validation — a SECOND
    // owner can never be minted here (D40 single-owner; ownership transfer is out of scope).
    await expect(
      svc.createUser({
        principal: principal(owner, "owner"),
        handle: "x",
        password: GOOD_PASSWORD,
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "cannot_grant_owner" });
  });

  test("a delegated admin CANNOT mint an admin — fail-closed forbidden (closes the create/set-role asymmetry)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    // The escalation vector: `setRole` is owner-only, so an admin creating a role:"admin" account outright
    // would bypass it. `createUser` now gates `role:"admin"` on requireOwner — the admin is refused.
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "shadow-admin",
        password: GOOD_PASSWORD,
        role: "admin",
      }),
    ).rejects.toThrow(DomainForbiddenError);
    // Nothing was written — the handle is free.
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>("shadow-admin")));
    expect(rows).toHaveLength(0);
  });

  test("a delegated admin CANNOT mint an owner — forbidden before the owner-refusal even runs", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: "x",
        password: GOOD_PASSWORD,
        role: "owner",
      }),
    ).rejects.toThrow(DomainForbiddenError);
  });

  test("the OWNER mints an admin (the owner-only elevation path succeeds, audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });

    const view = await svc.createUser({
      principal: principal(owner, "owner"),
      handle: "trusted",
      password: GOOD_PASSWORD,
      role: "admin",
    });
    expect(view.role).toBe("admin");
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.createUser");
    // The row landed as a real admin human.
    const rows = await db.select().from(users).where(eq(users.id, view.id));
    expect(rows[0]?.role).toBe("admin");
    expect(rows[0]?.kind).toBe("human");
  });

  test("a duplicate handle is rejected (user_exists)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
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
    await expect(svc.createUser({ principal: principal(u, "user"), handle: "x", password: GOOD_PASSWORD })).rejects.toThrow(DomainForbiddenError);
  });
});
